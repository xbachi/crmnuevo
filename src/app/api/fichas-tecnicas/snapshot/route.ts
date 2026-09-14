/**
 * POST /api/fichas-tecnicas/snapshot — extracción de una ficha técnica (tarjeta
 * ITV) leída de la carpeta del coche en OneDrive.
 *
 * El CRM en Vercel no puede leer OneDrive ni pasar una foto por un modelo de
 * visión: un script externo recorre las carpetas, lee la tarjeta con IA y POSTea
 * aquí el resultado campo a campo con su confianza. Este endpoint SOLO guarda;
 * el cruce contra el CRM y contra la web lo hace /api/cron/fichas-tecnicas.
 *
 * Body: { origen, carpeta, referencia, matricula_carpeta, archivo, hash,
 *         extraido_at, modelo_ia, campos: {campo: {valor, confianza}}, notas }
 *
 * `hash` = md5 del fichero (mismo algoritmo que facturas_registro.hash_contenido).
 * Con (matricula_norm, hash) se deduplica: el script reenvía el snapshot completo
 * cada día y la misma foto no vuelve a entrar. Foto nueva → hash nuevo → fila
 * nueva → el cron vuelve a avisar de lo que siga sin cuadrar.
 *
 * Auth: X-Webhook-Secret (mismo que /gestoria/expedientes-snapshot). Está en la
 * whitelist del middleware.
 */

import { NextRequest, NextResponse } from 'next/server'
import { pool } from '@/lib/direct-database'
import { safeEqual } from '@/lib/secrets'
import { normPlate } from '@/lib/facturasRegistro'
import { aliasDeMatricula } from '@/lib/aliasMatriculas'
import type { CampoExtraido, CamposFicha } from '@/lib/fichaTecnica'

export const dynamic = 'force-dynamic'

// md5 hex (32) o sha256 hex (64).
const HASH_RE = /^[0-9a-f]{32}$|^[0-9a-f]{64}$/

function texto(v: unknown, max = 500): string | null {
  const s = String(v ?? '').trim()
  return s ? s.slice(0, max) : null
}

/** ISO válido → ISO; cualquier otra cosa → null (recibido_at siempre queda). */
function fechaIso(v: unknown): string | null {
  const s = String(v ?? '').trim()
  if (!s) return null
  const d = new Date(s)
  return isNaN(d.getTime()) ? null : d.toISOString()
}

/**
 * Sanea el bloque `campos`. Cualquier campo puede faltar o venir con valor null;
 * lo que no tenga la forma {valor, confianza} se descarta en vez de guardarse:
 * el cruce lee este JSONB a ciegas y no queremos basura dentro.
 */
function saneaCampos(v: unknown): CamposFicha | null {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return null
  const out: Record<string, CampoExtraido> = {}
  for (const [clave, bruto] of Object.entries(v as Record<string, unknown>)) {
    if (!bruto || typeof bruto !== 'object' || Array.isArray(bruto)) continue
    const c = bruto as Record<string, unknown>
    const valor = c.valor
    const tipoOk =
      valor === null ||
      valor === undefined ||
      typeof valor === 'string' ||
      typeof valor === 'number'
    if (!tipoOk) continue
    const conf = Number(c.confianza)
    out[clave.slice(0, 80)] = {
      valor:
        typeof valor === 'string'
          ? valor.trim().slice(0, 300)
          : (valor as number | null) ?? null,
      confianza: Number.isFinite(conf) ? Math.max(0, Math.min(1, conf)) : 0,
    }
  }
  return out
}

/**
 * Vehículo al que pertenece la carpeta. Puede no haber ninguno (carpeta vieja,
 * matrícula mal escrita): la ficha se guarda igual con vehiculo_id NULL.
 *
 * Usa los alias de matrícula porque la carpeta puede llevar la provisional y el
 * CRM la definitiva (o al revés). Si la matrícula estuviera duplicada en dos
 * vehículos —error de datos conocido, ver fix-vehiculo-identidad.sql— se queda
 * con el original (id menor) en vez de dejar la ficha huérfana.
 */
async function resolverVehiculo(plate: string): Promise<number | null> {
  if (!plate) return null
  let plates = [plate]
  try {
    const alias = await aliasDeMatricula(pool, plate)
    if (alias.length) plates = alias
  } catch (err) {
    console.error(
      '[fichas-tecnicas] alias matrícula:',
      (err as Error)?.message ?? err
    )
  }
  const r = await pool.query<{ id: number }>(
    `SELECT id FROM "Vehiculo"
      WHERE matricula_norm = ANY($1::text[])
      ORDER BY id
      LIMIT 1`,
    [plates]
  )
  return r.rows[0]?.id ?? null
}

export async function POST(request: NextRequest) {
  const secret = process.env.N8N_INVOICE_WEBHOOK_SECRET ?? ''
  if (!secret || !safeEqual(request.headers.get('x-webhook-secret'), secret)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  const b = (await request.json().catch(() => ({}))) as Record<string, unknown>

  const hash = String(b.hash ?? '')
    .trim()
    .toLowerCase()
  if (!HASH_RE.test(hash)) {
    return NextResponse.json(
      { error: 'hash debe ser md5 (32) o sha256 (64) hexadecimal' },
      { status: 400 }
    )
  }

  const campos = saneaCampos(b.campos)
  if (!campos) {
    return NextResponse.json(
      { error: 'campos debe ser un objeto' },
      { status: 400 }
    )
  }

  const carpeta = texto(b.carpeta)
  const matriculaCarpeta = texto(b.matricula_carpeta, 20)
  // Si la carpeta no trae matrícula, se cae a la que leyó la IA de la tarjeta:
  // sin ninguna de las dos la fila no se puede cruzar con nada.
  const matriculaCampo = texto(campos.matricula?.valor, 20)
  const plate = normPlate(matriculaCarpeta ?? matriculaCampo ?? '')
  if (!plate) {
    return NextResponse.json(
      { error: 'falta matricula_carpeta (o campos.matricula)' },
      { status: 400 }
    )
  }

  try {
    const reg = await pool.query<{ reg: string | null }>(
      `SELECT to_regclass('public.fichas_tecnicas') AS reg`
    )
    if (!reg.rows[0]?.reg) {
      return NextResponse.json(
        {
          error:
            'tabla fichas_tecnicas no existe — aplicar create-fichas-tecnicas.sql',
        },
        { status: 503 }
      )
    }

    const vehiculoId = await resolverVehiculo(plate)

    const ins = await pool.query<{ id: number }>(
      `INSERT INTO fichas_tecnicas
         (vehiculo_id, referencia, matricula_carpeta, carpeta, archivo, hash,
          campos, notas, modelo_ia, extraido_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8, $9, $10)
       ON CONFLICT (matricula_norm, hash) DO NOTHING
       RETURNING id`,
      [
        vehiculoId,
        texto(b.referencia, 50),
        matriculaCarpeta ?? matriculaCampo,
        carpeta,
        texto(b.archivo, 300),
        hash,
        JSON.stringify(campos),
        texto(b.notas, 2000),
        texto(b.modelo_ia, 80),
        fechaIso(b.extraido_at),
      ]
    )

    if (ins.rows[0]) {
      return NextResponse.json({
        ok: true,
        ficha_id: ins.rows[0].id,
        vehiculo_id: vehiculoId,
        nueva: true,
      })
    }

    // Ya estaba (misma foto, mismo coche). Devolvemos la fila existente.
    const prev = await pool.query<{ id: number; vehiculo_id: number | null }>(
      `SELECT id, vehiculo_id FROM fichas_tecnicas
        WHERE matricula_norm = $1 AND hash = $2
        ORDER BY id DESC LIMIT 1`,
      [plate, hash]
    )
    const fila = prev.rows[0]
    // Se guardó huérfana (el coche aún no existía o tenía otra matrícula) y
    // ahora sí resuelve: sin esto la ficha quedaría invisible para el cron.
    if (fila && !fila.vehiculo_id && vehiculoId) {
      await pool.query(
        `UPDATE fichas_tecnicas SET vehiculo_id = $1 WHERE id = $2`,
        [vehiculoId, fila.id]
      )
    }

    return NextResponse.json({
      ok: true,
      ficha_id: fila?.id ?? null,
      vehiculo_id: vehiculoId ?? fila?.vehiculo_id ?? null,
      nueva: false,
    })
  } catch (err) {
    console.error('[fichas-tecnicas/snapshot]', (err as Error)?.message ?? err)
    return NextResponse.json(
      { ok: false, error: (err as Error).message },
      { status: 500 }
    )
  }
}

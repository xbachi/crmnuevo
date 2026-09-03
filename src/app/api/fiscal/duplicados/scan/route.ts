/**
 * POST /api/fiscal/duplicados/scan?anio=&dryRun=1 — duplicados difusos.
 *
 * QUÉ CAZA Y POR QUÉ: el hash md5 (ux_facturas_hash) ya hace IMPOSIBLE el
 * duplicado exacto — el mismo PDF nunca entra dos veces. Este scan busca el otro
 * caso, el que sí pasó de verdad: el mismo comprobante re-emitido por el
 * proveedor o re-escaneado, con bytes distintos → hash distinto → dos filas, dos
 * veces la misma cuota deducida. Así entraron las duplicadas R-023/024 y
 * R-025/026 del 2T.
 *
 * Regla: mismo proveedor + importe igual (±0,01) + fecha a ±3 días + hash
 * DISTINTO + ninguna ya marcada. Los ±3 días son el punto real: un duplicado
 * exacto de fecha ya lo agarra el UNIQUE(proveedor, numero_factura) cuando hay
 * número; lo que se escapa es el re-emitido con fecha corrida.
 *
 * NUNCA BORRA NI ANULA (regla dura del proyecto). Marca el más nuevo como
 * posible_duplicado apuntando al más viejo, y encola el par en la bandeja de
 * revisión con un título que explica el porqué. "Posible" es literal: dos
 * facturas del mismo importe a 3 días pueden ser dos repostajes reales. Decide
 * un humano, y para eso el título trae proveedor, importe, fechas y los dos
 * nombres de archivo — sin abrir la DB.
 *
 * dedup_key = fiscal-dup:{idViejo}:{idNuevo} → re-escanear no encola dos veces.
 * dryRun=1 → devuelve los pares sin escribir nada.
 *
 * Auth DUAL: X-Admin-Secret (curl/cron) O sesión admin (UI). Está en la whitelist
 * del middleware y se valida acá adentro (patrón /api/gestoria/chequeo-expedientes).
 */

import { NextRequest, NextResponse } from 'next/server'
import { pool } from '@/lib/direct-database'
import { requireAdminSession } from '@/lib/apiAuth'
import { registrarCambio } from '@/lib/fiscalAudit'
import { fecha as fmtFecha, num } from '@/lib/fiscalApi'
import { safeEqual } from '@/lib/secrets'

export const maxDuration = 30

const TOLERANCIA_IMPORTE = 0.01
const DIAS = 3

interface FilaPar {
  viejo_id: number
  viejo_num: string | null
  viejo_archivo: string | null
  viejo_fecha: string | null
  nuevo_id: number
  nuevo_num: string | null
  nuevo_archivo: string | null
  nuevo_fecha: string | null
  proveedor: string
  importe: string
}

const eur = (n: number | null): string =>
  n == null ? '—' : `${n.toFixed(2).replace('.', ',')} €`

export async function POST(request: NextRequest) {
  // Auth dual: secret para curl/cron, sesión admin para la UI.
  const secret =
    process.env.ADMIN_SECRET ?? process.env.N8N_INVOICE_WEBHOOK_SECRET ?? ''
  const gotSecret = request.headers.get('x-admin-secret') ?? ''
  let actor = 'sistema'
  if (!secret || !safeEqual(gotSecret, secret)) {
    const auth = requireAdminSession(request)
    if (auth.response) return auth.response
    actor = `uid:${auth.session.uid}`
  }

  const { searchParams } = new URL(request.url)
  const dryRun = searchParams.get('dryRun') === '1'
  const anioRaw = searchParams.get('anio')
  let anio: number | null = null
  if (anioRaw != null && anioRaw.trim() !== '') {
    anio = parseInt(anioRaw, 10)
    if (!Number.isInteger(anio) || anio < 2000 || anio > 2100) {
      return NextResponse.json(
        { error: `anio inválido: "${anioRaw}"` },
        { status: 400 }
      )
    }
  }

  try {
    // Self-join: cada par sale UNA vez (a.id < b.id) y ya ordenado viejo→nuevo por
    // fecha. `a` = más viejo. El desempate por id evita que dos filas del mismo
    // día se marquen mutuamente en ejecuciones distintas.
    const res = await pool.query<FilaPar>(
      `SELECT a.id            AS viejo_id,
              a.numero_factura AS viejo_num,
              a.nombre_archivo AS viejo_archivo,
              a.fecha_factura::text AS viejo_fecha,
              b.id            AS nuevo_id,
              b.numero_factura AS nuevo_num,
              b.nombre_archivo AS nuevo_archivo,
              b.fecha_factura::text AS nuevo_fecha,
              COALESCE(p.nombre, a.proveedor) AS proveedor,
              a.importe::text AS importe
         FROM facturas_registro a
         JOIN facturas_registro b
           ON b.proveedor_id = a.proveedor_id
          AND b.id <> a.id
          AND ABS(b.importe - a.importe) <= $1
          AND b.fecha_factura BETWEEN a.fecha_factura - $2::int AND a.fecha_factura + $2::int
          AND b.hash_contenido IS DISTINCT FROM a.hash_contenido
          -- viejo→nuevo estable: por fecha, y a igualdad de fecha por id.
          AND (b.fecha_factura, b.id) > (a.fecha_factura, a.id)
          -- ── Evidencia positiva de que son DOS facturas distintas ───────────
          -- Esto es una compraventa de coches: los proveedores de servicio cobran
          -- PRECIO ESTÁNDAR POR COCHE. La limpieza de world detailing son 90,75 €
          -- fijos, y el 2026-03-05 hubo tres: 26/39 (Dacia Sandero), 26/40 (Kia
          -- Stonic) y 26/41 (Peugeot). Mismo proveedor, mismo importe, mismo día
          -- y NO son duplicados: son tres coches. Sin estos dos filtros el scan
          -- devolvía 56 pares casi todos falsos, y una bandeja que grita siempre
          -- deja de mirarse — que es peor que no tenerla, porque el duplicado
          -- exacto ya lo ataja el UNIQUE de hash_contenido y esta heurística solo
          -- cubre el resto.
          --
          -- Un comprobante RE-EMITIDO conserva su número (ese caso lo caza el
          -- UNIQUE parcial (proveedor, numero_factura)); dos números distintos son
          -- dos comprobantes. Y distinta matrícula = distinto servicio.
          -- El par solo sobrevive si es COMPATIBLE con ser el mismo comprobante:
          -- número igual o alguno sin número, matrícula igual o alguna sin ella.
          AND (NULLIF(a.numero_factura, '') IS NULL
            OR NULLIF(b.numero_factura, '') IS NULL
            OR a.numero_factura = b.numero_factura)
          AND (NULLIF(a.matricula, '') IS NULL
            OR NULLIF(b.matricula, '') IS NULL
            OR a.matricula = b.matricula)
         LEFT JOIN proveedores p ON p.id = a.proveedor_id
        WHERE a.proveedor_id IS NOT NULL
          AND a.importe IS NOT NULL
          AND a.fecha_factura IS NOT NULL
          AND b.importe IS NOT NULL
          AND b.fecha_factura IS NOT NULL
          -- ninguna ya resuelta como duplicado: re-escanear no re-marca cadenas.
          AND a.duplicado_de IS NULL
          AND b.duplicado_de IS NULL
          AND ($3::int IS NULL OR (a.anio = $3 AND b.anio = $3))
        ORDER BY a.fecha_factura, a.id`,
      [TOLERANCIA_IMPORTE, DIAS, anio]
    )

    const pares = res.rows.map((r) => {
      const importe = num(r.importe)
      const vFecha = fmtFecha(r.viejo_fecha)
      const nFecha = fmtFecha(r.nuevo_fecha)
      return {
        viejo: {
          id: Number(r.viejo_id),
          numeroFactura: r.viejo_num,
          nombreArchivo: r.viejo_archivo,
          fechaFactura: vFecha,
        },
        nuevo: {
          id: Number(r.nuevo_id),
          numeroFactura: r.nuevo_num,
          nombreArchivo: r.nuevo_archivo,
          fechaFactura: nFecha,
        },
        proveedor: r.proveedor,
        importe,
        dedupKey: `fiscal-dup:${Number(r.viejo_id)}:${Number(r.nuevo_id)}`,
        // Lo lee un humano en la bandeja: tiene que poder decidir sin abrir la DB.
        titulo:
          `Posible factura duplicada de ${r.proveedor}: ${eur(importe)} el ${vFecha} y otra vez el ${nFecha}. ` +
          `Archivos: "${r.viejo_archivo ?? 'sin nombre'}" (#${r.viejo_id}${r.viejo_num ? `, nº ${r.viejo_num}` : ''}) y ` +
          `"${r.nuevo_archivo ?? 'sin nombre'}" (#${r.nuevo_id}${r.nuevo_num ? `, nº ${r.nuevo_num}` : ''}). ` +
          `Son archivos distintos con el mismo importe a pocos días: si es el mismo comprobante re-emitido, anulá el más nuevo; si son dos gastos reales, descartá este aviso.`,
      }
    })

    if (dryRun) {
      return NextResponse.json({
        dryRun: true,
        anio,
        pares: pares.length,
        marcadas: 0,
        encoladas: 0,
        items: pares,
      })
    }

    let marcadas = 0
    let encoladas = 0

    const client = await pool.connect()
    try {
      await client.query('BEGIN')

      // ¿Existe la bandeja? (mismo criterio tolerante que periodoLock: el deploy
      // no puede depender de haber corrido el SQL primero).
      const reg = await client.query<{ t: string | null }>(
        `SELECT to_regclass('public.revision_items')::text AS t`
      )
      const hayBandeja = Boolean(reg.rows[0]?.t)

      for (const par of pares) {
        // Marcar SOLO el más nuevo. El viejo no se toca: es el que se queda.
        const upd = await client.query(
          `UPDATE facturas_registro
              SET posible_duplicado = true, duplicado_de = $2, updated_at = NOW()
            WHERE id = $1 AND duplicado_de IS NULL
            RETURNING id`,
          [par.nuevo.id, par.viejo.id]
        )
        if (upd.rows.length === 0) continue // otra corrida lo tomó primero
        marcadas++

        await registrarCambio(client, {
          tabla: 'facturas_registro',
          filaId: par.nuevo.id,
          accion: 'editar',
          cambios: {
            posible_duplicado: { antes: false, despues: true },
            duplicado_de: { antes: null, despues: par.viejo.id },
          },
          actor,
          motivo: `scan de duplicados: mismo proveedor e importe (${eur(par.importe)}) a ${DIAS} días o menos de la factura #${par.viejo.id}, con archivo distinto`,
        })

        if (hayBandeja) {
          const ins = await client.query(
            `INSERT INTO revision_items (origen, titulo, payload, dedup_key)
             VALUES ('fiscal-duplicado', $1, $2::jsonb, $3)
             ON CONFLICT (dedup_key) DO NOTHING
             RETURNING id`,
            [
              par.titulo,
              JSON.stringify({
                tipoAccion: 'fiscal-duplicado',
                proveedor: par.proveedor,
                importe: par.importe,
                registroId: par.nuevo.id,
                duplicadoDe: par.viejo.id,
                viejo: par.viejo,
                nuevo: par.nuevo,
                motivo: `Mismo proveedor e importe a ±${DIAS} días con hash distinto (el md5 no lo caza: son bytes distintos).`,
              }),
              par.dedupKey,
            ]
          )
          if (ins.rows.length > 0) encoladas++
        }
      }

      await client.query('COMMIT')

      return NextResponse.json({
        dryRun: false,
        anio,
        pares: pares.length,
        marcadas,
        encoladas,
        bandeja: hayBandeja,
        items: pares,
        mensaje: `${pares.length} par(es) detectado(s); ${marcadas} factura(s) marcada(s) como posible duplicado y ${encoladas} encolada(s) en revisión. No se borró ni anuló nada: decide un humano.`,
      })
    } catch (err) {
      await client.query('ROLLBACK').catch(() => {})
      throw err
    } finally {
      client.release()
    }
  } catch (err) {
    console.error(
      '[fiscal/duplicados/scan] POST:',
      (err as Error)?.message ?? err
    )
    return NextResponse.json(
      { error: 'No se pudo escanear duplicados' },
      { status: 500 }
    )
  }
}

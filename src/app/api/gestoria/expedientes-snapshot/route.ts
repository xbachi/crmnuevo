/**
 * POST /api/gestoria/expedientes-snapshot — inventario de carpetas de
 * expedientes en OneDrive (el CRM en Vercel no puede leer OneDrive; un script
 * del server escanea GESTORIA/<año>/<trimestre> y POSTea acá el estado íntegro).
 *
 * Body: { anio, trimestre, carpetas: [{mes, carpeta, archivos: [{nombre, bytes, hash}]}] }
 *
 * `hash` = md5 del contenido del archivo (mismo algoritmo que
 * facturas_registro.hash_contenido → cruzan). Es OPCIONAL: los snapshots viejos
 * sin hash se siguen aceptando (la detección cae al nombre).
 *
 * Reemplazo TOTAL del trimestre en una transacción: DELETE de las filas de ese
 * (anio, trimestre) + INSERT del snapshot completo. Así una carpeta borrada en
 * OneDrive desaparece también del snapshot (un upsert la dejaría zombie).
 *
 * Auth: X-Webhook-Secret (mismo que /gestoria/factura). En whitelist del middleware.
 */

import { NextRequest, NextResponse } from 'next/server'
import { pool } from '@/lib/direct-database'
import { matriculaFromCarpeta } from '@/lib/expedienteDocs'

interface CarpetaBody {
  mes: string
  carpeta: string
  archivos: { nombre: string; bytes: number | null; hash: string | null }[]
}

// md5 hex (32) o sha256 hex (64); cualquier otra cosa se guarda como null.
const HASH_RE = /^[0-9a-f]{32}$|^[0-9a-f]{64}$/

export async function POST(request: NextRequest) {
  const secret = process.env.N8N_INVOICE_WEBHOOK_SECRET ?? ''
  if (!secret || (request.headers.get('x-webhook-secret') ?? '') !== secret) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  const b = (await request.json().catch(() => ({}))) as Record<string, unknown>
  const anio = parseInt(String(b.anio ?? ''), 10)
  const trimestre = parseInt(String(b.trimestre ?? ''), 10)
  if (!Number.isInteger(anio) || anio < 2000 || anio > 2100) {
    return NextResponse.json({ error: 'anio inválido' }, { status: 400 })
  }
  if (![1, 2, 3, 4].includes(trimestre)) {
    return NextResponse.json({ error: 'trimestre debe ser 1, 2, 3 o 4' }, { status: 400 })
  }
  if (!Array.isArray(b.carpetas)) {
    return NextResponse.json({ error: 'carpetas debe ser un array' }, { status: 400 })
  }
  const carpetas: CarpetaBody[] = []
  for (const c of b.carpetas as Record<string, unknown>[]) {
    const mes = String(c?.mes ?? '').trim()
    const carpeta = String(c?.carpeta ?? '').trim()
    if (!mes || !carpeta) {
      return NextResponse.json({ error: 'cada carpeta requiere mes y carpeta' }, { status: 400 })
    }
    const archivos = (Array.isArray(c.archivos) ? c.archivos : [])
      .map((a: Record<string, unknown>) => {
        const hash = String(a?.hash ?? '').trim().toLowerCase()
        return {
          nombre: String(a?.nombre ?? '').trim(),
          bytes: typeof a?.bytes === 'number' ? a.bytes : null,
          hash: HASH_RE.test(hash) ? hash : null,
        }
      })
      .filter((a) => a.nombre)
    carpetas.push({ mes, carpeta, archivos })
  }

  try {
    const reg = await pool.query<{ reg: string | null }>(
      `SELECT to_regclass('public.expedientes_carpetas') AS reg`
    )
    if (!reg.rows[0]?.reg) {
      return NextResponse.json(
        { error: 'tabla expedientes_carpetas no existe — aplicar create-expedientes-carpetas.sql' },
        { status: 503 }
      )
    }

    const client = await pool.connect()
    let borradas = 0
    let archivosTotal = 0
    try {
      await client.query('BEGIN')
      const del = await client.query(
        `DELETE FROM expedientes_carpetas WHERE anio = $1 AND trimestre = $2`,
        [anio, trimestre]
      )
      borradas = del.rowCount ?? 0
      for (const c of carpetas) {
        archivosTotal += c.archivos.length
        await client.query(
          `INSERT INTO expedientes_carpetas
             (anio, trimestre, mes, carpeta, matricula_norm, archivos, scanned_at)
           VALUES ($1, $2, $3, $4, $5, $6::jsonb, NOW())`,
          [anio, trimestre, c.mes, c.carpeta, matriculaFromCarpeta(c.carpeta), JSON.stringify(c.archivos)]
        )
      }
      await client.query('COMMIT')
    } catch (err) {
      await client.query('ROLLBACK').catch(() => {})
      throw err
    } finally {
      client.release()
    }

    return NextResponse.json({
      ok: true,
      anio,
      trimestre,
      carpetas: carpetas.length,
      archivos: archivosTotal,
      reemplazadas: borradas,
    })
  } catch (err) {
    return NextResponse.json({ ok: false, error: (err as Error).message }, { status: 500 })
  }
}

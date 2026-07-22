/**
 * POST /api/admin/repair-gastos-dup?dryRun=true|false
 *
 * Repara el DOBLE CONTEO de gastos de la migración del 2026-07-02: los totales
 * de la hoja "2026" se importaron como baselines (proveedor 'migracion-2026',
 * numero_factura SHEET2026-{tipo}-{matricula}) y el mismo día el backfill de
 * OneDrive cargó las facturas individuales que esos totales ya incluían. Como
 * el campo del Vehiculo = SUMA de gasto_facturas del tipo, esos coches quedaron
 * con el gasto duplicado (se dedupeó 'compra' en su momento; los servicios no).
 *
 * Acción: para cada (vehículo, campo) que tenga baseline Y facturas reales a la
 * vez, borra la baseline (las facturas reales, con PDF detrás, son la verdad),
 * recalcula el campo del Vehiculo y re-sincroniza la fila del coche en CB 2026
 * (overwrite, auditado en costobeneficio_logs). Las baselines de coches SIN
 * facturas reales no se tocan: son el único registro de ese gasto.
 *
 * Idempotente: tras aplicar, no quedan pares baseline+reales y devuelve vacío.
 * Protegido por X-Admin-Secret. dryRun=true (default) solo informa.
 */

import { NextRequest, NextResponse } from 'next/server'
import { pool } from '@/lib/direct-database'
import { campoParaTipo, tiposCanonicos } from '@/lib/gastoMapping'
import { resyncVehiculoRowToCB } from '@/lib/costoBeneficio'
import { AdminParamError, assertKnownParams, parseStrictBool } from '@/lib/adminParams'

const MIGRACION = 'migracion-2026'

interface Par {
  vehiculoId: number
  referencia: string
  matricula: string | null
  coche: string
  campo: string
  baselineIds: number[]
  baseline: number
  reales: number
  campoActual: number
  nuevoValor: number
}

export async function POST(request: NextRequest) {
  const secret = process.env.ADMIN_SECRET ?? process.env.N8N_INVOICE_WEBHOOK_SECRET ?? ''
  if (!secret || (request.headers.get('x-admin-secret') ?? '') !== secret) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  let dryRun: boolean
  try {
    const sp = request.nextUrl.searchParams
    assertKnownParams(sp, ['dryRun'])
    dryRun = parseStrictBool(sp, 'dryRun', true)
  } catch (err) {
    if (err instanceof AdminParamError) {
      return NextResponse.json({ error: err.message }, { status: 400 })
    }
    throw err
  }

  const res = await pool.query(`
    SELECT g.id, g.vehiculo_id, g.tipo, g.importe, g.proveedor,
           v.referencia, v.matricula, v.marca, v.modelo
      FROM gasto_facturas g
      JOIN "Vehiculo" v ON v.id = g.vehiculo_id
     ORDER BY g.id`)

  const porPar = new Map<string, Par>()
  for (const r of res.rows) {
    const campo = campoParaTipo(String(r.tipo))
    if (!campo) continue
    const key = `${r.vehiculo_id}:${campo}`
    let par = porPar.get(key)
    if (!par) {
      par = {
        vehiculoId: r.vehiculo_id,
        referencia: r.referencia,
        matricula: r.matricula,
        coche: [r.marca, r.modelo].filter(Boolean).join(' '),
        campo,
        baselineIds: [],
        baseline: 0,
        reales: 0,
        campoActual: 0,
        nuevoValor: 0,
      }
      porPar.set(key, par)
    }
    const importe = Number(r.importe) || 0
    par.campoActual += importe
    if (r.proveedor === MIGRACION) {
      par.baselineIds.push(r.id)
      par.baseline += importe
    } else {
      par.reales += importe
    }
  }

  const afectados = [...porPar.values()].filter(
    (p) => p.baselineIds.length > 0 && p.baseline > 0 && p.reales > 0
  )
  for (const p of afectados) p.nuevoValor = p.reales

  const round2 = (n: number) => Math.round(n * 100) / 100
  const informe = afectados.map((p) => ({
    referencia: p.referencia,
    matricula: p.matricula,
    coche: p.coche,
    campo: p.campo,
    baselineEliminada: round2(p.baseline),
    facturasReales: round2(p.reales),
    antes: round2(p.campoActual),
    despues: round2(p.nuevoValor),
  }))
  const sobreconteo = round2(afectados.reduce((s, p) => s + p.baseline, 0))

  if (dryRun || afectados.length === 0) {
    return NextResponse.json({ dryRun, afectados: informe, sobreconteo })
  }

  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const ids = afectados.flatMap((p) => p.baselineIds)
    await client.query(`DELETE FROM gasto_facturas WHERE id = ANY($1)`, [ids])
    for (const p of afectados) {
      // campo sale de TIPO_A_CAMPO (whitelist) → seguro interpolarlo
      await client.query(
        `UPDATE "Vehiculo" SET "${p.campo}" = (
           SELECT COALESCE(SUM(importe),0) FROM gasto_facturas
            WHERE vehiculo_id = $1 AND tipo = ANY($2)
         ) WHERE id = $1`,
        [p.vehiculoId, tiposCanonicos(p.campo)]
      )
    }
    await client.query('COMMIT')
  } catch (err) {
    await client.query('ROLLBACK')
    throw err
  } finally {
    client.release()
  }

  // CB: overwrite de las celdas de costo de cada coche afectado (best-effort)
  const cbResync: Record<string, string> = {}
  for (const vehiculoId of [...new Set(afectados.map((p) => p.vehiculoId))]) {
    const r = await resyncVehiculoRowToCB(vehiculoId, 'CB 2026', 'repair-gastos-dup')
    cbResync[String(vehiculoId)] = `${r.action}: ${r.detail}`
  }

  return NextResponse.json({ dryRun: false, afectados: informe, sobreconteo, cbResync })
}

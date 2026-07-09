import { NextRequest, NextResponse } from 'next/server'
import { pool } from '@/lib/direct-database'
import { parseImporte } from '@/lib/gastoImporte'
import { TIPO_A_CAMPO, normPlate, campoParaTipo, tiposCanonicos } from '@/lib/gastoMapping'

/**
 * POST /api/vehiculos/gasto
 *
 * Lo llama el flujo de n8n cuando descarga y archiva una factura de proveedor.
 * Carga el importe en el campo de gastos del vehículo (por matrícula/referencia)
 * de forma idempotente: cada nº de factura se aplica una sola vez (tabla
 * gasto_facturas), y el campo del Vehiculo pasa a ser la SUMA de las facturas
 * de ese tipo (soporta varias facturas del mismo proveedor por coche).
 *
 * Auth: X-Webhook-Secret (mismo secreto que el resto del flujo n8n). En la
 * whitelist del middleware.
 *
 * Body: {
 *   matricula?: string, referencia?: string,   // al menos uno
 *   tipo: 'mecauto'|'fergo'|'world'|'compra'|'transporte'|'itv',
 *   importe: number|string,                     // total con IVA
 *   numeroFactura: string,
 *   proveedor?: string
 * }
 */

export async function POST(request: NextRequest) {
  const secret = process.env.N8N_INVOICE_WEBHOOK_SECRET ?? ''
  const got = request.headers.get('x-webhook-secret') ?? ''
  if (!secret || got !== secret) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  const b = (await request.json().catch(() => ({}))) as Record<string, unknown>
  const tipoRaw = String(b.tipo ?? '').toLowerCase().trim()
  const campo = campoParaTipo(tipoRaw)
  if (!campo) {
    return NextResponse.json(
      { error: `tipo inválido: "${tipoRaw}". Válidos: ${Object.keys(TIPO_A_CAMPO).join(', ')}` },
      { status: 400 }
    )
  }
  const importe = parseImporte(b.importe)
  if (importe == null) {
    return NextResponse.json({ error: `importe inválido: ${JSON.stringify(b.importe)}` }, { status: 400 })
  }
  const numeroFactura = b.numeroFactura ? String(b.numeroFactura).trim() : null
  if (!numeroFactura) {
    return NextResponse.json({ error: 'numeroFactura requerido (idempotencia)' }, { status: 400 })
  }
  const matricula = b.matricula ? String(b.matricula).trim() : null
  const referencia = b.referencia ? String(b.referencia).trim() : null
  if (!matricula && !referencia) {
    return NextResponse.json({ error: 'matricula o referencia requerida' }, { status: 400 })
  }
  const proveedor = b.proveedor ? String(b.proveedor).trim() : tipoRaw

  // 1) resolver vehículo
  const vres = matricula
    ? await pool.query(
        `SELECT id, matricula FROM "Vehiculo"
          WHERE REPLACE(REPLACE(REPLACE(UPPER(matricula),' ',''),'-',''),'.','') = $1
          LIMIT 1`,
        [normPlate(matricula)]
      )
    : await pool.query(`SELECT id, matricula FROM "Vehiculo" WHERE referencia = $1 LIMIT 1`, [referencia])
  const vehiculo = vres.rows[0]
  if (!vehiculo) {
    return NextResponse.json(
      { error: 'vehículo no encontrado', matricula, referencia, tipo: tipoRaw },
      { status: 404 }
    )
  }

  // 2) libro de facturas (idempotente por tipo+numeroFactura)
  await pool.query(
    `INSERT INTO gasto_facturas (vehiculo_id, matricula, tipo, numero_factura, importe, proveedor)
       VALUES ($1,$2,$3,$4,$5,$6)
     ON CONFLICT (tipo, numero_factura)
       DO UPDATE SET importe = EXCLUDED.importe, vehiculo_id = EXCLUDED.vehiculo_id,
                     matricula = EXCLUDED.matricula, proveedor = EXCLUDED.proveedor, updated_at = NOW()`,
    [vehiculo.id, vehiculo.matricula, tipoRaw, numeroFactura, importe, proveedor]
  )

  // 3) recomputar el campo del Vehiculo = SUMA de facturas de ese tipo
  const canonTipos = tiposCanonicos(campo)
  const sumRes = await pool.query(
    `SELECT COALESCE(SUM(importe),0) AS total FROM gasto_facturas
      WHERE vehiculo_id = $1 AND tipo = ANY($2)`,
    [vehiculo.id, canonTipos]
  )
  const total = Number(sumRes.rows[0].total)
  // campo viene de una whitelist (TIPO_A_CAMPO) → seguro interpolarlo
  await pool.query(`UPDATE "Vehiculo" SET "${campo}" = $1 WHERE id = $2`, [total, vehiculo.id])

  // Reflejar el costo en CB 2026 si el coche ya tiene fila (venta emitida).
  // Best-effort + timeout: no bloquea ni falla la respuesta a n8n.
  let cbResync: string | null = null
  try {
    const { resyncVehiculoRowToCB } = await import('@/lib/costoBeneficio')
    const r = await Promise.race([
      resyncVehiculoRowToCB(vehiculo.id, 'CB 2026'),
      new Promise<null>((resolve) => setTimeout(() => resolve(null), 8000)),
    ])
    cbResync = r ? `${r.action}: ${r.detail}` : 'timeout'
  } catch (err) {
    cbResync = `error: ${(err as Error)?.message ?? err}`
  }

  return NextResponse.json({
    cbResync,
    ok: true,
    vehiculoId: vehiculo.id,
    matricula: vehiculo.matricula,
    campo,
    nuevoValor: total,
    facturaAplicada: numeroFactura,
  })
}

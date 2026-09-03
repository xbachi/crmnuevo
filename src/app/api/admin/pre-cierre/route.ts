/**
 * GET /api/admin/pre-cierre?quarter=1&year=2026
 *
 * Chequeo pre-cierre trimestral: cruza invoices / automation_logs /
 * webhook_outbox / facturas_registro / gasto_facturas y devuelve rojo/verde
 * por ítem con evidencia (nunca sólo un booleano). Pensado para correr antes
 * de entregar el trimestre a gestoría.
 *
 * Protegido por X-Admin-Secret. Sólo lee.
 */

import { NextRequest, NextResponse } from 'next/server'
import { pool } from '@/lib/direct-database'
import { quarterRange } from '@/lib/facturasMonitor'
import { safeEqual } from '@/lib/secrets'

interface FacturaRow {
  full_invoice_number: string
  invoice_date: string
  vehicle_plate: string | null
}

export async function GET(request: NextRequest) {
  const secret =
    process.env.ADMIN_SECRET ?? process.env.N8N_INVOICE_WEBHOOK_SECRET ?? ''
  if (!secret || !safeEqual(request.headers.get('x-admin-secret'), secret)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  const { searchParams } = new URL(request.url)
  const year = parseInt(
    searchParams.get('year') || String(new Date().getFullYear()),
    10
  )
  const quarter = parseInt(searchParams.get('quarter') || '', 10)
  if (![1, 2, 3, 4].includes(quarter)) {
    return NextResponse.json(
      { error: 'quarter debe ser 1, 2, 3 o 4' },
      { status: 400 }
    )
  }
  const { from, to } = quarterRange(year, quarter)

  try {
    // 1. Facturas ISSUED del trimestre sin fila en automation_logs (C-23: el
    //    webhook nunca llegó a n8n o n8n nunca respondió). Sólo ISSUED: las
    //    IMPORTED/legacy nunca pasaron por notifyGestoriaInvoice.
    const sinLog = await pool.query<FacturaRow>(
      `SELECT i.full_invoice_number, i.invoice_date::text, i.vehicle_plate
         FROM invoices i
         LEFT JOIN automation_logs al ON al.numero_factura = i.full_invoice_number
        WHERE i.status = 'ISSUED' AND i.invoice_date >= $1 AND i.invoice_date < $2
          AND i.invoice_type <> 'RECTIFYING'
          AND al.id IS NULL
        ORDER BY i.invoice_date`,
      [from, to]
    )

    // 2. Facturas ISSUED del trimestre sin expediente confirmado. Señal usada:
    //    automation_logs.venta_guardada (comentario de la propia tabla en
    //    scripts/sql/0011-automation-logs.sql: "✓ archivada en 1_Ventas +
    //    expediente"). Cubre tanto "no hay log" como "hay log pero n8n
    //    reportó que el archivado del expediente falló".
    const sinExpediente = await pool.query<FacturaRow>(
      `SELECT i.full_invoice_number, i.invoice_date::text, i.vehicle_plate
         FROM invoices i
         LEFT JOIN automation_logs al ON al.numero_factura = i.full_invoice_number
        WHERE i.status = 'ISSUED' AND i.invoice_date >= $1 AND i.invoice_date < $2
          AND i.invoice_type <> 'RECTIFYING'
          AND COALESCE(al.venta_guardada, FALSE) = FALSE
        ORDER BY i.invoice_date`,
      [from, to]
    )

    // 3. Outbox pendiente o agotado creado en el trimestre.
    const outbox = await pool.query(
      `SELECT id, numero_factura, estado, intentos, ultimo_error, created_at
         FROM webhook_outbox
        WHERE estado IN ('pendiente', 'agotado') AND created_at >= $1 AND created_at < $2
        ORDER BY created_at`,
      [from, to]
    )

    // 4 + 5. Registro unificado del trimestre con huecos de fecha/importe.
    // facturas_registro tiene anio/trimestre propios (se calculan al insertar
    // desde fecha_factura), así que filtramos por esas columnas y no por rango
    // de fecha — mismo patrón que /api/gestoria/audit.
    const sinFecha = await pool.query(
      `SELECT id, proveedor, numero_factura, nombre_archivo
         FROM facturas_registro
        WHERE anio = $1 AND trimestre = $2 AND fecha_factura IS NULL
        ORDER BY proveedor`,
      [year, quarter]
    )
    const sinImporte = await pool.query(
      `SELECT id, proveedor, numero_factura, nombre_archivo
         FROM facturas_registro
        WHERE anio = $1 AND trimestre = $2 AND importe IS NULL
        ORDER BY proveedor`,
      [year, quarter]
    )

    // 6. gasto_facturas.numero_canonico — columna que puede o no existir
    //    todavía (posible migración en curso de otro agente en paralelo);
    //    se chequea information_schema antes de referenciarla. Informativo,
    //    nunca bloqueante. gasto_facturas no tiene columna de fecha propia,
    //    así que usamos created_at como proxy del período.
    const colCheck = await pool.query(
      `SELECT 1 FROM information_schema.columns
        WHERE table_name = 'gasto_facturas' AND column_name = 'numero_canonico'`
    )
    let gastoSinNumeroCanonico: Record<string, unknown>
    if (colCheck.rows.length > 0) {
      const gastos = await pool.query(
        `SELECT id, tipo, numero_factura, vehiculo_id
           FROM gasto_facturas
          WHERE numero_canonico IS NULL AND created_at >= $1 AND created_at < $2
          ORDER BY created_at`,
        [from, to]
      )
      gastoSinNumeroCanonico = {
        ok: gastos.rows.length === 0,
        informativo: true,
        verificable: true,
        count: gastos.rows.length,
        detalle: gastos.rows,
      }
    } else {
      gastoSinNumeroCanonico = {
        ok: true,
        informativo: true,
        verificable: false,
        count: null,
        nota: 'columna numero_canonico no existe en gasto_facturas — no verificable desde DB',
      }
    }

    // 7. Expedientes del trimestre (deal jacket). La tabla puede no existir
    //    todavía (migración create-expedientes.sql pendiente) → to_regclass,
    //    mismo patrón que numero_canonico. A diferencia de aquél, los
    //    expedientes incompletos SÍ son bloqueantes: un expediente incompleto
    //    nunca se considera finalizado.
    const expTable = await pool.query<{ reg: string | null }>(
      `SELECT to_regclass('public.expedientes') AS reg`
    )
    let expedientes: Record<string, unknown>
    let expedientesIncompletos = 0
    if (expTable.rows[0]?.reg) {
      const porEstadoRes = await pool.query<{ estado: string; n: number }>(
        `SELECT estado, COUNT(*)::int AS n
           FROM expedientes
          WHERE invoice_date >= $1 AND invoice_date < $2
          GROUP BY estado`,
        [from, to]
      )
      const porEstado: Record<string, number> = {}
      for (const row of porEstadoRes.rows) porEstado[row.estado] = row.n
      const incompletos = await pool.query(
        `SELECT id, numero_factura, matricula, tipo_operacion, invoice_date::text, checklist
           FROM expedientes
          WHERE estado = 'incompleto' AND invoice_date >= $1 AND invoice_date < $2
          ORDER BY invoice_date`,
        [from, to]
      )
      expedientesIncompletos = incompletos.rows.length
      expedientes = {
        ok: expedientesIncompletos === 0,
        verificable: true,
        count: expedientesIncompletos,
        porEstado,
        detalle: incompletos.rows,
      }
    } else {
      expedientes = {
        ok: true,
        verificable: false,
        count: null,
        nota: 'tabla expedientes no existe — aplicar create-expedientes.sql',
      }
    }

    const bloqueantes: string[] = []
    if (sinLog.rows.length > 0) bloqueantes.push('facturasSinAutomationLog')
    if (sinExpediente.rows.length > 0) bloqueantes.push('facturasSinExpediente')
    if (outbox.rows.length > 0) bloqueantes.push('outboxPendientes')
    if (sinFecha.rows.length > 0) bloqueantes.push('registroSinFecha')
    if (sinImporte.rows.length > 0) bloqueantes.push('registroSinImporte')
    if (expedientesIncompletos > 0) bloqueantes.push('expedientesIncompletos')
    // gastoSinNumeroCanonico es informativo, nunca entra en bloqueantes.

    return NextResponse.json({
      ok: bloqueantes.length === 0,
      year,
      quarter,
      resumen: { ok: bloqueantes.length === 0, bloqueantes },
      facturasSinAutomationLog: {
        ok: sinLog.rows.length === 0,
        count: sinLog.rows.length,
        detalle: sinLog.rows,
      },
      facturasSinExpediente: {
        ok: sinExpediente.rows.length === 0,
        count: sinExpediente.rows.length,
        detalle: sinExpediente.rows,
      },
      outboxPendientes: {
        ok: outbox.rows.length === 0,
        count: outbox.rows.length,
        detalle: outbox.rows,
      },
      registroSinFecha: {
        ok: sinFecha.rows.length === 0,
        count: sinFecha.rows.length,
        detalle: sinFecha.rows,
      },
      registroSinImporte: {
        ok: sinImporte.rows.length === 0,
        count: sinImporte.rows.length,
        detalle: sinImporte.rows,
      },
      gastoSinNumeroCanonico,
      expedientes,
    })
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: (err as Error).message },
      { status: 500 }
    )
  }
}

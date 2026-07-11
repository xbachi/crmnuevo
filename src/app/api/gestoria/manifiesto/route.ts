/**
 * GET /api/gestoria/manifiesto?quarter=2&year=2026&format=json|csv
 *
 * Documento de entrega del trimestre a la gestoría: qué documentos archivados
 * (facturas_registro, con hash md5 verificable) y qué facturas emitidas por el
 * CRM componen la entrega, con totales por categoría y por mes y el estado de
 * cierre de los 3 meses del trimestre.
 *
 * format=csv → dos secciones (documentos, emitidas) con separador `;` y BOM
 * UTF-8 (Excel español), attachment manifiesto-YYYY-TN.csv.
 *
 * Sólo lee. X-Admin-Secret. En whitelist del middleware.
 */

import { NextRequest, NextResponse } from 'next/server'
import { pool } from '@/lib/direct-database'
import { quarterRange } from '@/lib/facturasMonitor'
import { buildCsvDocument, csvNum, csvResponse } from '@/lib/gestoriaCsv'

interface DocumentoRow {
  fecha_factura: string | null
  proveedor: string
  numero_factura: string | null
  importe: string | null
  categoria: string
  mes: number | null
  matricula: string | null
  hash_contenido: string
  nombre_archivo: string | null
  ruta: string | null
}

interface EmitidaRow {
  full_invoice_number: string
  invoice_date: string
  invoice_type: string
  status: string
  total_amount: string
  vehicle_plate: string | null
}

export async function GET(request: NextRequest) {
  const secret = process.env.ADMIN_SECRET ?? process.env.N8N_INVOICE_WEBHOOK_SECRET ?? ''
  if (!secret || (request.headers.get('x-admin-secret') ?? '') !== secret) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  const { searchParams } = new URL(request.url)
  const year = parseInt(searchParams.get('year') || String(new Date().getFullYear()), 10)
  const quarter = parseInt(searchParams.get('quarter') || '', 10)
  if (![1, 2, 3, 4].includes(quarter)) {
    return NextResponse.json({ error: 'quarter debe ser 1, 2, 3 o 4' }, { status: 400 })
  }
  const format = searchParams.get('format') === 'csv' ? 'csv' : 'json'
  const { from, to } = quarterRange(year, quarter)
  const mesesTrimestre = [1, 2, 3].map((i) => (quarter - 1) * 3 + i)

  try {
    const docs = await pool.query<DocumentoRow>(
      `SELECT fecha_factura::text, proveedor, numero_factura, importe, categoria,
              mes, matricula, hash_contenido, nombre_archivo, ruta
         FROM facturas_registro
        WHERE anio = $1 AND trimestre = $2
        ORDER BY categoria, fecha_factura NULLS LAST, proveedor, id`,
      [year, quarter]
    )

    const emitidas = await pool.query<EmitidaRow>(
      `SELECT full_invoice_number, invoice_date::text, invoice_type, status,
              total_amount, vehicle_plate
         FROM invoices
        WHERE invoice_date >= $1 AND invoice_date < $2
        ORDER BY invoice_date, full_invoice_number`,
      [from, to]
    )

    // Estado de cierre de los 3 meses (tabla opcional: sin migración → abiertos).
    const reg = await pool.query<{ t: string | null }>(
      `SELECT to_regclass('public.periodos_contables')::text AS t`
    )
    const estadoPorMes = new Map<number, string>()
    if (reg.rows[0]?.t) {
      const per = await pool.query<{ mes: number; estado: string }>(
        `SELECT mes, estado FROM periodos_contables WHERE anio = $1 AND mes = ANY($2)`,
        [year, mesesTrimestre]
      )
      for (const r of per.rows) estadoPorMes.set(r.mes, r.estado)
    }
    const periodos = mesesTrimestre.map((mes) => ({
      anio: year,
      mes,
      estado: estadoPorMes.get(mes) ?? 'abierto',
    }))

    // Totales de documentos por categoría y por mes.
    const porCategoria = new Map<string, { count: number; suma: number }>()
    const docsPorMes = new Map<number, { count: number; suma: number }>()
    for (const d of docs.rows) {
      const imp = d.importe != null ? Number(d.importe) : 0
      const cat = porCategoria.get(d.categoria) ?? { count: 0, suma: 0 }
      cat.count += 1
      cat.suma += imp
      porCategoria.set(d.categoria, cat)
      if (d.mes != null) {
        const m = docsPorMes.get(d.mes) ?? { count: 0, suma: 0 }
        m.count += 1
        m.suma += imp
        docsPorMes.set(d.mes, m)
      }
    }

    // Totales de emitidas por mes (las VOIDED se listan pero no suman).
    const emitidasPorMes = new Map<number, { count: number; suma: number }>()
    let emitidasSuma = 0
    let emitidasCount = 0
    for (const e of emitidas.rows) {
      if (e.status === 'VOIDED') continue
      const mes = parseInt(e.invoice_date.slice(5, 7), 10)
      const m = emitidasPorMes.get(mes) ?? { count: 0, suma: 0 }
      m.count += 1
      m.suma += Number(e.total_amount)
      emitidasPorMes.set(mes, m)
      emitidasCount += 1
      emitidasSuma += Number(e.total_amount)
    }
    const round2 = (n: number) => Number(n.toFixed(2))

    const totales = {
      documentos: {
        count: docs.rows.length,
        suma: round2(
          docs.rows.reduce((acc, d) => acc + (d.importe != null ? Number(d.importe) : 0), 0)
        ),
        por_categoria: [...porCategoria.entries()].map(([categoria, v]) => ({
          categoria,
          count: v.count,
          suma: round2(v.suma),
        })),
        por_mes: mesesTrimestre.map((mes) => ({
          mes,
          count: docsPorMes.get(mes)?.count ?? 0,
          suma: round2(docsPorMes.get(mes)?.suma ?? 0),
        })),
      },
      emitidas: {
        count: emitidasCount,
        suma: round2(emitidasSuma),
        nota: 'las facturas VOIDED se listan pero no suman',
        por_mes: mesesTrimestre.map((mes) => ({
          mes,
          count: emitidasPorMes.get(mes)?.count ?? 0,
          suma: round2(emitidasPorMes.get(mes)?.suma ?? 0),
        })),
      },
    }

    if (format === 'csv') {
      const csv = buildCsvDocument([
        {
          titulo: `MANIFIESTO DE ENTREGA ${year} T${quarter} — DOCUMENTOS (facturas_registro)`,
          headers: [
            'fecha', 'proveedor', 'numero_factura', 'importe', 'categoria',
            'mes', 'matricula', 'hash_md5', 'nombre_archivo', 'ruta',
          ],
          rows: docs.rows.map((d) => [
            d.fecha_factura, d.proveedor, d.numero_factura, csvNum(d.importe),
            d.categoria, d.mes, d.matricula, d.hash_contenido, d.nombre_archivo, d.ruta,
          ]),
        },
        {
          titulo: `MANIFIESTO DE ENTREGA ${year} T${quarter} — FACTURAS EMITIDAS (CRM)`,
          headers: ['numero', 'fecha', 'tipo', 'estado', 'total', 'matricula'],
          rows: emitidas.rows.map((e) => [
            e.full_invoice_number, e.invoice_date, e.invoice_type, e.status,
            csvNum(e.total_amount), e.vehicle_plate,
          ]),
        },
      ])
      return csvResponse(csv, `manifiesto-${year}-T${quarter}.csv`)
    }

    return NextResponse.json({
      ok: true,
      tipo: 'manifiesto-entrega',
      year,
      quarter,
      generado_at: new Date().toISOString(),
      periodos,
      conteos: { documentos: docs.rows.length, emitidas: emitidas.rows.length },
      totales,
      documentos: docs.rows,
      emitidas: emitidas.rows,
    })
  } catch (err) {
    return NextResponse.json({ ok: false, error: (err as Error).message }, { status: 500 })
  }
}

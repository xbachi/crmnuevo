/**
 * GET /api/gestoria/libro?quarter=2&year=2026&format=json|csv
 *
 * Libro registro de facturas del trimestre, estructurado para la gestoría:
 *
 *  - Emitidas (invoices, sin VOIDED). Incluye a propósito las RECTIFIED (la
 *    original anulada, en positivo) y las RECTIFYING (la rectificativa, en
 *    negativo): el par netea a cero y la gestoría ve las dos, que es lo que
 *    pide una anulación formal.
 *      · VAT: base/cuota desde taxable_base/vat_amount (la tabla los guarda al
 *        emitir — computeAmounts). Si faltan (legacy IMPORTED), se derivan
 *        base = total/1,21 y cuota = total − base, marcado base_derivada=true.
 *      · REBU: total, y margen = precioVenta − precioCompra del Vehiculo
 *        vinculado; cuota_rebu = margen × 21/121 (IVA incluido en el margen).
 *        Sin precioCompra cargado (null/0) → margen y cuota null con motivo:
 *        NUNCA se inventa un margen con compra = 0.
 *  - Recibidas (facturas_registro): total por documento; base/cuota van null
 *    (no las tenemos desglosadas; la columna está para que la gestoría complete).
 *  - Totales al pie por tipo.
 *
 * format=csv → mismo formato Excel español que el manifiesto (`;` + BOM),
 * attachment libro-YYYY-TN.csv.
 *
 * Sólo lee. X-Admin-Secret. En whitelist del middleware.
 */

import { NextRequest, NextResponse } from 'next/server'
import { pool } from '@/lib/direct-database'
import { quarterRange } from '@/lib/facturasMonitor'
import { buildCsvDocument, csvNum, csvResponse } from '@/lib/gestoriaCsv'

const VAT_RATE = 21

interface EmitidaDbRow {
  full_invoice_number: string
  invoice_date: string
  invoice_type: string
  status: string
  vehicle_plate: string | null
  vehiculo_id: number | null
  total_amount: string
  taxable_base: string | null
  vat_amount: string | null
  precio_compra: string | null
  precio_venta: string | null
}

interface EmitidaLibro {
  numero: string
  fecha: string
  tipo: string
  /** Régimen fiscal real de la fila: una RECTIFYING hereda el de la factura
   *  que rectifica (es lo que decide en qué bloque de totales suma). */
  regimen: 'VAT' | 'REBU'
  estado: string
  matricula: string | null
  total: number
  base: number | null
  cuota: number | null
  base_derivada: boolean
  margen: number | null
  cuota_rebu: number | null
  nota: string | null
}

const round2 = (n: number) => Number(n.toFixed(2))

function toLibroRow(r: EmitidaDbRow): EmitidaLibro {
  const total = Number(r.total_amount)
  // Una rectificativa de REBU se guarda sin desglose (taxable_base NULL), igual
  // que la REBU que anula; una de VAT siempre trae base/cuota (negativas) —
  // invariante garantizado por computeRectificativaAmounts.
  const esRectificativa = r.invoice_type === 'RECTIFYING'
  const esRebu =
    r.invoice_type === 'REBU' || (esRectificativa && r.taxable_base == null)

  const row: EmitidaLibro = {
    numero: r.full_invoice_number,
    fecha: r.invoice_date,
    tipo: r.invoice_type,
    regimen: esRebu ? 'REBU' : 'VAT',
    estado: r.status,
    matricula: r.vehicle_plate,
    total,
    base: null,
    cuota: null,
    base_derivada: false,
    margen: null,
    cuota_rebu: null,
    nota: null,
  }

  if (esRebu) {
    const compra = r.precio_compra != null ? Number(r.precio_compra) : null
    if (!compra) {
      row.nota = 'sin precio de compra cargado'
      return row
    }
    const venta = r.precio_venta != null && Number(r.precio_venta) !== 0 ? Number(r.precio_venta) : Math.abs(total)
    const margen = round2(venta - compra)
    // La rectificativa anula el margen de la original: mismo importe con signo
    // opuesto → el par netea a cero también en el bloque REBU.
    const signo = esRectificativa ? -1 : 1
    row.margen = round2(margen * signo)
    row.cuota_rebu = round2((row.margen * VAT_RATE) / (100 + VAT_RATE))
    if (r.precio_venta == null || Number(r.precio_venta) === 0) {
      row.nota = 'margen calculado con el total de la factura (precioVenta no cargado)'
    }
    return row
  }

  // VAT (y las RECTIFYING de una VAT, con base/cuota negativas).
  if (r.taxable_base != null) {
    row.base = Number(r.taxable_base)
    row.cuota = r.vat_amount != null ? Number(r.vat_amount) : round2(total - row.base)
  } else {
    row.base = round2(total / (1 + VAT_RATE / 100))
    row.cuota = round2(total - row.base)
    row.base_derivada = true
    row.nota = 'base/cuota derivadas del total (÷1,21); la fila no traía desglose'
  }
  return row
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

  try {
    const emitidasDb = await pool.query<EmitidaDbRow>(
      `SELECT i.full_invoice_number, i.invoice_date::text, i.invoice_type, i.status,
              i.vehicle_plate, i.vehiculo_id, i.total_amount, i.taxable_base, i.vat_amount,
              v."precioCompra" AS precio_compra, v."precioVenta" AS precio_venta
         FROM invoices i
         LEFT JOIN "Vehiculo" v ON v.id = i.vehiculo_id
        WHERE i.invoice_date >= $1 AND i.invoice_date < $2
          AND i.status <> 'VOIDED'
        ORDER BY i.invoice_date, i.full_invoice_number`,
      [from, to]
    )
    const emitidas = emitidasDb.rows.map(toLibroRow)

    const recibidasDb = await pool.query<{
      fecha_factura: string | null
      proveedor: string
      numero_factura: string | null
      categoria: string
      importe: string | null
    }>(
      `SELECT fecha_factura::text, proveedor, numero_factura, categoria, importe
         FROM facturas_registro
        WHERE anio = $1 AND trimestre = $2
        ORDER BY fecha_factura NULLS LAST, proveedor, id`,
      [year, quarter]
    )
    const recibidas = recibidasDb.rows.map((r) => ({
      fecha: r.fecha_factura,
      proveedor: r.proveedor,
      numero: r.numero_factura,
      categoria: r.categoria,
      total: r.importe != null ? Number(r.importe) : null,
      base: null as number | null,
      cuota: null as number | null,
    }))

    const vat = emitidas.filter((e) => e.regimen === 'VAT')
    const rebu = emitidas.filter((e) => e.regimen === 'REBU')
    const sum = (xs: (number | null)[]) => round2(xs.reduce<number>((a, x) => a + (x ?? 0), 0))
    const totales = {
      emitidas_vat: {
        count: vat.length,
        base: sum(vat.map((e) => e.base)),
        cuota: sum(vat.map((e) => e.cuota)),
        total: sum(vat.map((e) => e.total)),
      },
      emitidas_rebu: {
        count: rebu.length,
        total: sum(rebu.map((e) => e.total)),
        margen: sum(rebu.map((e) => e.margen)),
        cuota_rebu: sum(rebu.map((e) => e.cuota_rebu)),
        sin_margen: rebu.filter((e) => e.margen == null).length,
      },
      recibidas: {
        count: recibidas.length,
        total: sum(recibidas.map((r) => r.total)),
      },
    }

    if (format === 'csv') {
      const csv = buildCsvDocument([
        {
          titulo: `LIBRO REGISTRO ${year} T${quarter} — FACTURAS EMITIDAS`,
          headers: [
            'numero', 'fecha', 'tipo', 'regimen', 'estado', 'matricula', 'total',
            'base', 'cuota', 'margen_rebu', 'cuota_rebu', 'nota',
          ],
          rows: emitidas.map((e) => [
            e.numero, e.fecha, e.tipo, e.regimen, e.estado, e.matricula, csvNum(e.total),
            csvNum(e.base), csvNum(e.cuota), csvNum(e.margen), csvNum(e.cuota_rebu), e.nota,
          ]),
        },
        {
          titulo: `LIBRO REGISTRO ${year} T${quarter} — FACTURAS RECIBIDAS`,
          headers: ['fecha', 'proveedor', 'numero', 'categoria', 'total', 'base', 'cuota'],
          rows: recibidas.map((r) => [
            r.fecha, r.proveedor, r.numero, r.categoria, csvNum(r.total), '', '',
          ]),
        },
        {
          titulo: `LIBRO REGISTRO ${year} T${quarter} — TOTALES`,
          headers: ['tipo', 'count', 'base', 'cuota', 'total', 'margen_rebu', 'cuota_rebu'],
          rows: [
            ['emitidas VAT', totales.emitidas_vat.count, csvNum(totales.emitidas_vat.base),
              csvNum(totales.emitidas_vat.cuota), csvNum(totales.emitidas_vat.total), '', ''],
            ['emitidas REBU', totales.emitidas_rebu.count, '', '',
              csvNum(totales.emitidas_rebu.total), csvNum(totales.emitidas_rebu.margen),
              csvNum(totales.emitidas_rebu.cuota_rebu)],
            ['recibidas', totales.recibidas.count, '', '', csvNum(totales.recibidas.total), '', ''],
          ],
        },
      ])
      return csvResponse(csv, `libro-${year}-T${quarter}.csv`)
    }

    return NextResponse.json({
      ok: true,
      tipo: 'libro-registro',
      year,
      quarter,
      generado_at: new Date().toISOString(),
      notas: [
        'REBU: cuota_rebu = margen × 21/121 (IVA incluido en el margen); sin precioCompra el margen va null',
        'Rectificativas (FR, RECTIFYING): importes NEGATIVOS; se listan junto a la original RECTIFIED y netean a cero',
        'Recibidas: base/cuota null — sin desglose en origen, completa la gestoría',
      ],
      emitidas,
      recibidas,
      totales,
    })
  } catch (err) {
    return NextResponse.json({ ok: false, error: (err as Error).message }, { status: 500 })
  }
}

/**
 * GET /api/gestoria/audit?year=2026&q=2
 *
 * Revisión INSTANTÁNEA del registro de facturas (sin abrir PDFs) para entregar
 * a gestoría. El registro es la fuente de verdad y ya no admite duplicados
 * (UNIQUE por hash / proveedor+número), así que acá reportamos completitud:
 * conteos por mes/proveedor y facturas incompletas (sin fecha/número/matrícula)
 * que hay que revisar antes de entregar.
 *
 * Protegido por X-Admin-Secret. Sólo lee.
 */

import { NextRequest, NextResponse } from 'next/server'
import { pool } from '@/lib/direct-database'
import { MES_NOM } from '@/lib/facturasRegistro'

export async function GET(request: NextRequest) {
  const secret = process.env.ADMIN_SECRET ?? process.env.N8N_INVOICE_WEBHOOK_SECRET ?? ''
  if (!secret || (request.headers.get('x-admin-secret') ?? '') !== secret) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }
  const { searchParams } = new URL(request.url)
  const year = parseInt(searchParams.get('year') || String(new Date().getFullYear()), 10)
  const qRaw = searchParams.get('q')
  const q = qRaw ? parseInt(qRaw, 10) : null

  try {
    const where = q ? 'anio = $1 AND trimestre = $2' : 'anio = $1'
    const params = q ? [year, q] : [year]

    const total = await pool.query(`SELECT count(*)::int n FROM facturas_registro WHERE ${where}`, params)

    const porMes = await pool.query(
      `SELECT mes, count(*)::int n, sum(importe) total FROM facturas_registro
        WHERE ${where} GROUP BY mes ORDER BY mes`, params)

    const porProv = await pool.query(
      `SELECT proveedor, categoria, count(*)::int n FROM facturas_registro
        WHERE ${where} GROUP BY proveedor, categoria ORDER BY n DESC`, params)

    // incompletas (a revisar antes de entregar)
    const sinFecha = await pool.query(
      `SELECT id, proveedor, numero_factura, nombre_archivo FROM facturas_registro
        WHERE ${where} AND mes IS NULL ORDER BY proveedor`, params)
    const sinNumero = await pool.query(
      `SELECT id, proveedor, mes, nombre_archivo FROM facturas_registro
        WHERE ${where} AND (numero_factura IS NULL OR numero_factura = '') ORDER BY proveedor`, params)
    const cocheSinMat = await pool.query(
      `SELECT id, proveedor, categoria, nombre_archivo FROM facturas_registro
        WHERE ${where} AND categoria LIKE 'coche-%' AND (matricula IS NULL OR matricula = '') ORDER BY proveedor`, params)

    const incompletas = sinFecha.rows.length + sinNumero.rows.length + cocheSinMat.rows.length

    return NextResponse.json({
      ok: incompletas === 0,
      year, trimestre: q,
      total: total.rows[0].n,
      porMes: porMes.rows.map((r) => ({ mes: r.mes, nombre: r.mes ? MES_NOM[r.mes - 1] : null, n: r.n, total: r.total })),
      porProveedor: porProv.rows,
      incompletas: {
        count: incompletas,
        sinFecha: sinFecha.rows,
        sinNumero: sinNumero.rows,
        cocheSinMatricula: cocheSinMat.rows,
      },
    })
  } catch (err) {
    return NextResponse.json({ ok: false, error: (err as Error).message }, { status: 500 })
  }
}

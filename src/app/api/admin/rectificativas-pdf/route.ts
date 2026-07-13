/**
 * POST /api/admin/rectificativas-pdf   header: X-Admin-Secret
 * body: { ids?: number[], dryRun?: boolean, archivarGestoria?: boolean }
 *
 * Reparación de las rectificativas que quedaron sin PDF (status PDF_PENDING /
 * ERROR) porque el generador todavía no sabía emitirlas. Para cada una:
 *   1. genera el PDF de la FR (sello RECTIFICATIVA, importes en negativo,
 *      referencia a la original con número y fecha) → Blob + status ISSUED;
 *   2. regenera el PDF de la ORIGINAL con el sello ANULADA (lo que se descargue
 *      hoy del CRM tiene que verse anulado);
 *   3. opcionalmente (archivarGestoria: true) archiva la FR en OneDrive/GESTORIA
 *      vía n8n, para que la gestora tenga original + rectificativa juntas.
 *
 * NO consume números fiscales, NO toca importes, NO emite nada nuevo.
 * `dryRun: true` sólo lista lo que haría.
 */

import { NextRequest, NextResponse } from 'next/server'
import { pool } from '@/lib/direct-database'
import {
  buildInvoicePdf,
  generateAndAttachPdf,
  formatFechaES,
} from '@/lib/invoiceService'
import { getInvoiceById, type Invoice } from '@/lib/invoiceRepository'
import { notifyGestoriaInvoice } from '@/lib/gestoriaWebhook'

export const maxDuration = 60

interface Resultado {
  id: number
  numero: string
  status: string
  pdf_url?: string | null
  original?: { id: number; numero: string; pdf_url?: string | null } | null
  archivada?: boolean
  error?: string
}

export async function POST(request: NextRequest) {
  const secret =
    process.env.ADMIN_SECRET ?? process.env.N8N_INVOICE_WEBHOOK_SECRET ?? ''
  const got = request.headers.get('x-admin-secret') ?? ''
  if (!secret || got !== secret) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  }

  const body = await request.json().catch(() => ({}))
  const ids: number[] = Array.isArray(body?.ids)
    ? body.ids.map((v: unknown) => parseInt(String(v), 10)).filter(Number.isInteger)
    : []
  const dryRun = body?.dryRun === true
  const archivarGestoria = body?.archivarGestoria === true

  const pendientes = await pool.query<Invoice>(
    ids.length > 0
      ? `SELECT * FROM invoices
          WHERE invoice_type = 'RECTIFYING' AND id = ANY($1::int[])
          ORDER BY id`
      : `SELECT * FROM invoices
          WHERE invoice_type = 'RECTIFYING' AND status IN ('PDF_PENDING', 'ERROR')
          ORDER BY id`,
    ids.length > 0 ? [ids] : []
  )

  if (dryRun) {
    return NextResponse.json({
      ok: true,
      dryRun: true,
      total: pendientes.rowCount,
      rectificativas: pendientes.rows.map((r) => ({
        id: r.id,
        numero: r.full_invoice_number,
        status: r.status,
        importe: r.total_amount,
        rectifica_invoice_id: r.rectifies_invoice_id ?? null,
        fecha: formatFechaES(r.invoice_date),
      })),
    })
  }

  const resultados: Resultado[] = []

  for (const fr of pendientes.rows) {
    const item: Resultado = {
      id: fr.id,
      numero: fr.full_invoice_number,
      status: fr.status,
    }
    try {
      const { invoice: conPdf, pdf } = await generateAndAttachPdf(fr)
      item.status = conPdf.status
      item.pdf_url = conPdf.pdf_url

      await pool.query(
        `INSERT INTO invoice_audit_logs (invoice_id, action, new_values_json, reason, user_id, user_role)
         VALUES ($1, 'PDF_REGENERATED', $2, $3, 'admin-secret', 'admin')`,
        [
          fr.id,
          JSON.stringify({ pdf_url: conPdf.pdf_url }),
          'Reparación: PDF de factura rectificativa',
        ]
      )

      // La original: sello ANULADA + referencia a la FR.
      const original = fr.rectifies_invoice_id
        ? await getInvoiceById(fr.rectifies_invoice_id)
        : null
      if (original) {
        const restampada = await generateAndAttachPdf(original)
        item.original = {
          id: original.id,
          numero: original.full_invoice_number,
          pdf_url: restampada.invoice.pdf_url,
        }
        await pool.query(
          `INSERT INTO invoice_audit_logs (invoice_id, action, new_values_json, reason, user_id, user_role)
           VALUES ($1, 'PDF_REGENERATED', $2, $3, 'admin-secret', 'admin')`,
          [
            original.id,
            JSON.stringify({ pdf_url: restampada.invoice.pdf_url }),
            `Sello ANULADA: rectificada por ${fr.full_invoice_number}`,
          ]
        )
      }

      if (archivarGestoria) {
        await notifyGestoriaInvoice({
          numeroFactura: conPdf.full_invoice_number,
          fechaISO: String(conPdf.invoice_date).slice(0, 10),
          matricula: conPdf.vehicle_plate,
          marca: conPdf.vehicle_make,
          modelo: conPdf.vehicle_model,
          tipo: 'RECTIFYING',
          pdfBase64: Buffer.from(pdf).toString('base64'),
        })
        item.archivada = true
      }
    } catch (err) {
      console.error('[admin/rectificativas-pdf]', fr.full_invoice_number, err)
      item.error = (err as Error)?.message ?? String(err)
    }
    resultados.push(item)
  }

  return NextResponse.json({
    ok: resultados.every((r) => !r.error),
    total: resultados.length,
    resultados,
  })
}

/**
 * GET /api/admin/rectificativas-pdf?id=123   header: X-Admin-Secret
 *
 * Devuelve el PDF renderizado en el momento (sin tocar la DB ni el Blob), para
 * revisarlo antes de reparar nada.
 */
export async function GET(request: NextRequest) {
  const secret =
    process.env.ADMIN_SECRET ?? process.env.N8N_INVOICE_WEBHOOK_SECRET ?? ''
  const got = request.headers.get('x-admin-secret') ?? ''
  if (!secret || got !== secret) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  }

  const id = parseInt(request.nextUrl.searchParams.get('id') ?? '', 10)
  if (Number.isNaN(id)) {
    return NextResponse.json({ error: 'Falta ?id=' }, { status: 400 })
  }
  const invoice = await getInvoiceById(id)
  if (!invoice) {
    return NextResponse.json({ error: 'Factura no encontrada' }, { status: 404 })
  }

  const pdf = await buildInvoicePdf(invoice)
  return new NextResponse(Buffer.from(pdf), {
    status: 200,
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="preview-${invoice.full_invoice_number}.pdf"`,
      'Cache-Control': 'private, no-store',
    },
  })
}

/**
 * POST /api/expedientes/reparar-factura-venta
 * body: { year, quarter, dryRun?: boolean }  ← dryRun por defecto TRUE
 *
 * Repara el agujero real de producción: la factura de venta sólo llega a la
 * carpeta del expediente en OneDrive cuando se EMITE desde el CRM
 * (invoiceService → notifyGestoriaInvoice → webhook n8n). Las facturas
 * IMPORTED/LEGACY (alta por SQL desde Deal.factura, sin PDF) nunca dispararon
 * esa copia, así que su expediente queda sin factura de venta para siempre.
 *
 * Reusa EXACTAMENTE el mismo camino que la emisión (postGestoriaWebhook +
 * webhook_outbox) — n8n nombra el archivo Factura-Venta-{NUMERO}.pdf.
 *
 * Tres resultados posibles por factura:
 *   - yaEstaban    → la carpeta ya tiene la factura de venta (nada que hacer)
 *   - reparadas    → el CRM tiene el PDF y falló/nunca corrió la copia (BUG)
 *   - sinPdfEnCrm  → el CRM no tiene el PDF (IMPORTED): NO se puede reparar
 *                    automáticamente, es trabajo humano pendiente (subir el
 *                    PDF a mano a la carpeta del expediente).
 *
 * Auth: sesión de admin (requireAdminSession) — no va en PUBLIC_API_PREFIXES.
 */

import { NextRequest, NextResponse } from 'next/server'
import { pool } from '@/lib/direct-database'
import { requireAdminSession } from '@/lib/apiAuth'
import { quarterRange } from '@/lib/facturasMonitor'
import { postGestoriaWebhook, type GestoriaInvoicePayload } from '@/lib/gestoriaWebhook'
import { insertOutboxPending, markOutboxEnviado, markOutboxFallo } from '@/lib/webhookOutbox'
import { detectarDocs } from '@/lib/expedienteDocs'
import { normPlate } from '@/lib/costoBeneficioSheet'

// Descarga de PDF + webhook por factura, con pool de 1 conexión: el default
// de 10s no alcanza para un trimestre entero.
export const maxDuration = 60

const ACTIVE_STATUSES = ['ISSUED', 'IMPORTED', 'PDF_PENDING']

/** Nombre canónico con el que n8n archiva la factura en el expediente.
 *  (no se exporta: Next sólo admite handlers + config en un route.ts) */
const nombreCanonico = (numero: string) => `Factura-Venta-${numero}.pdf`

interface InvoiceRow {
  full_invoice_number: string
  invoice_date: string
  vehicle_plate: string | null
  vehicle_make: string | null
  vehicle_model: string | null
  invoice_type: string
  status: string
  pdf_url: string | null
  pdf_storage_key: string | null
}

interface CarpetaRow {
  carpeta: string
  matricula_norm: string | null
  archivos: { nombre: string }[]
}

export async function POST(request: NextRequest) {
  const auth = requireAdminSession(request)
  if (auth.response) return auth.response

  let body: { year?: unknown; quarter?: unknown; dryRun?: unknown }
  try {
    body = (await request.json()) as typeof body
  } catch {
    body = {}
  }

  const year = parseInt(String(body.year ?? new Date().getFullYear()), 10)
  const quarter = parseInt(String(body.quarter ?? ''), 10)
  if (![1, 2, 3, 4].includes(quarter)) {
    return NextResponse.json({ error: 'quarter debe ser 1, 2, 3 o 4' }, { status: 400 })
  }
  if (!Number.isFinite(year)) {
    return NextResponse.json({ error: 'year inválido' }, { status: 400 })
  }
  // Sólo escribe con dryRun:false explícito.
  const dryRun = body.dryRun !== false

  const { from, to } = quarterRange(year, quarter)

  try {
    // 1. Snapshot de carpetas de OneDrive: sin él no se puede saber a qué
    //    expediente le falta la factura, y reparar a ciegas duplicaría copias.
    const reg = await pool.query<{ reg: string | null }>(
      `SELECT to_regclass('public.expedientes_carpetas') AS reg`
    )
    if (!reg.rows[0]?.reg) {
      return NextResponse.json(
        {
          ok: false,
          verificable: false,
          nota: 'La tabla expedientes_carpetas no existe todavía — sin snapshot de OneDrive no se puede reparar.',
        },
        { status: 409 }
      )
    }

    const snap = await pool.query<CarpetaRow>(
      `SELECT carpeta, matricula_norm, archivos
         FROM expedientes_carpetas
        WHERE anio = $1 AND trimestre = $2`,
      [year, quarter]
    )
    if (snap.rows.length === 0) {
      return NextResponse.json(
        {
          ok: false,
          verificable: false,
          nota: `Sin snapshot de OneDrive para ${quarter}T ${year} — corré el snapshot de expedientes antes de reparar.`,
        },
        { status: 409 }
      )
    }

    // matrícula normalizada → { carpeta, tieneFacturaVenta }
    const porMatricula = new Map<string, { carpeta: string; tieneFacturaVenta: boolean }>()
    for (const c of snap.rows) {
      if (!c.matricula_norm) continue
      const archivos = Array.isArray(c.archivos) ? c.archivos : []
      const tiene = detectarDocs(archivos).facturaVenta
      const key = normPlate(c.matricula_norm)
      const prev = porMatricula.get(key)
      // Si hay más de una carpeta para la misma matrícula, basta con que una
      // tenga la factura de venta.
      porMatricula.set(key, {
        carpeta: prev?.carpeta ?? c.carpeta,
        tieneFacturaVenta: (prev?.tieneFacturaVenta ?? false) || tiene,
      })
    }

    // 2. Facturas activas del trimestre.
    const inv = await pool.query<InvoiceRow>(
      `SELECT full_invoice_number, invoice_date::text, vehicle_plate,
              vehicle_make, vehicle_model, invoice_type, status,
              pdf_url, pdf_storage_key
         FROM invoices
        WHERE status = ANY($1) AND invoice_date >= $2 AND invoice_date < $3
        ORDER BY invoice_date`,
      [ACTIVE_STATUSES, from, to]
    )

    const yaEstaban: { numero: string; matricula: string | null; fecha: string; carpeta: string }[] =
      []
    const sinPdfEnCrm: {
      numero: string
      matricula: string | null
      fecha: string
      status: string
      motivo: string
    }[] = []
    const reparadas: {
      numero: string
      matricula: string | null
      fecha: string
      carpeta: string | null
      archivo: string
      aplicado: boolean
    }[] = []
    const fallidas: { numero: string; matricula: string | null; error: string }[] = []

    for (const f of inv.rows) {
      const numero = f.full_invoice_number
      const plate = f.vehicle_plate ? normPlate(f.vehicle_plate) : null
      const carpeta = plate ? porMatricula.get(plate) : undefined

      if (carpeta?.tieneFacturaVenta) {
        yaEstaban.push({
          numero,
          matricula: f.vehicle_plate,
          fecha: f.invoice_date,
          carpeta: carpeta.carpeta,
        })
        continue
      }

      // Falta la factura de venta en el expediente. ¿Se puede reparar?
      if (!f.pdf_url) {
        sinPdfEnCrm.push({
          numero,
          matricula: f.vehicle_plate,
          fecha: f.invoice_date,
          status: f.status,
          motivo: f.pdf_storage_key
            ? 'pdf_storage_key sin pdf_url: el PDF no es descargable desde el CRM'
            : 'el CRM nunca tuvo el PDF (factura importada/legacy) — hay que subirlo a mano',
        })
        continue
      }
      if (!plate) {
        fallidas.push({
          numero,
          matricula: null,
          error: 'factura sin matrícula: n8n no puede ubicar la carpeta del expediente',
        })
        continue
      }

      const item = {
        numero,
        matricula: f.vehicle_plate,
        fecha: f.invoice_date,
        carpeta: carpeta?.carpeta ?? null,
        archivo: nombreCanonico(numero),
        aplicado: false,
      }

      if (dryRun) {
        reparadas.push(item)
        continue
      }

      // Aplicar: descargar el PDF del blob y mandarlo por el MISMO camino que
      // la emisión (webhook n8n + webhook_outbox).
      try {
        const res = await fetch(f.pdf_url)
        if (!res.ok) throw new Error(`descarga del PDF falló (${res.status})`)
        const pdfBase64 = Buffer.from(await res.arrayBuffer()).toString('base64')

        const payload: GestoriaInvoicePayload = {
          numeroFactura: numero,
          fechaISO: f.invoice_date,
          matricula: f.vehicle_plate,
          marca: f.vehicle_make,
          modelo: f.vehicle_model,
          tipo: f.invoice_type,
          pdfBase64,
        }
        const outboxId = await insertOutboxPending('factura_venta', payload, numero)
        const sent = await postGestoriaWebhook(payload)
        if (!sent.ok) {
          if (outboxId) await markOutboxFallo(outboxId, sent.error ?? 'unknown error')
          throw new Error(sent.error ?? 'webhook falló')
        }
        if (outboxId) await markOutboxEnviado(outboxId)
        reparadas.push({ ...item, aplicado: true })
      } catch (err) {
        fallidas.push({
          numero,
          matricula: f.vehicle_plate,
          error: (err as Error)?.message ?? String(err),
        })
      }
    }

    return NextResponse.json({
      ok: fallidas.length === 0,
      dryRun,
      year,
      quarter,
      totalFacturas: inv.rows.length,
      reparadas,
      sinPdfEnCrm,
      yaEstaban,
      fallidas,
      nota: dryRun
        ? 'Simulación: no se copió nada. Volvé a llamar con dryRun:false para aplicar.'
        : undefined,
      notaSinPdf:
        sinPdfEnCrm.length > 0
          ? `${sinPdfEnCrm.length} factura(s) no se pueden reparar automáticamente: el CRM no tiene el PDF (facturas importadas/legacy). Hay que subir el PDF a la carpeta del expediente a mano, como ${nombreCanonico('<NUMERO>')}.`
          : undefined,
    })
  } catch (err) {
    return NextResponse.json({ ok: false, error: (err as Error).message }, { status: 500 })
  }
}

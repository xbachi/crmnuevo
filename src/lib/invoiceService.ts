/**
 * Invoice issuance service.
 *
 * The single point in the codebase that consumes invoice numbers from
 * `invoice_sequences`. All other code that needs to know "what's the next
 * invoice number?" or "issue an invoice for this deal" must go through
 * here.
 *
 * Why centralise:
 *   - Numbering must be atomic (SELECT ... FOR UPDATE on the sequence row).
 *   - Idempotency: a double-clicked "Emitir" button must not produce two
 *     invoices for the same sale.
 *   - Failure modes (PDF generation, Blob upload) must not waste a fiscal
 *     number — we reserve the number first, then attempt the PDF; on
 *     failure the row stays as PDF_PENDING and can be retried with the
 *     same number.
 */

import { put } from '@vercel/blob'
import { pool } from '@/lib/direct-database'
import { generarFactura } from '@/lib/contractGenerator'
import {
  INVOICE_CONFIG,
  buildFullInvoiceNumber,
  formatNumber,
} from '@/config/invoiceConfig'
import {
  getDefaultActiveSequence,
  getInvoiceById,
  getInvoiceByDealAndType,
  getInvoiceByIdempotencyKey,
  type Invoice,
  type InvoiceType,
} from '@/lib/invoiceRepository'

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface IssueOptions {
  dealId: number
  invoiceType: InvoiceType
  idempotencyKey?: string | null
  invoiceDate?: Date
  notes?: string | null
  userId?: string | null
  userRole?: string | null
}

export interface PreviewResult {
  invoiceType: InvoiceType
  series: string
  /** Tentative — not yet consumed. */
  nextNumber: number
  /** Tentative — not yet consumed. */
  fullInvoiceNumber: string
  invoiceDate: string
  buyer: ReturnType<typeof buildBuyerSnapshot>
  vehicle: ReturnType<typeof buildVehicleSnapshot>
  amounts: Amounts
}

export interface IssueResult {
  invoice: Invoice
  /** True when the request was idempotent — an existing invoice was returned
   *  instead of creating a new one. */
  alreadyExisted: boolean
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Compute everything the issue flow would need, and report what number
 * would be assigned, **without consuming a number**. The sequence row
 * is read but not locked — a concurrent issue may take this number from
 * us before we actually emit. That's acceptable for a preview.
 */
export async function previewInvoice(
  dealId: number,
  invoiceType: InvoiceType
): Promise<PreviewResult> {
  const sale = await loadSale(dealId)
  const sequence = await getDefaultActiveSequence(invoiceType)
  if (!sequence) {
    throw new InvoiceServiceError(
      'NO_SEQUENCE',
      `No hay serie activa configurada para el tipo ${invoiceType}.`
    )
  }

  const buyer = buildBuyerSnapshot(sale)
  const vehicle = buildVehicleSnapshot(sale)
  const amounts = computeAmounts(sale.importeTotal ?? 0, invoiceType)

  return {
    invoiceType,
    series: sequence.series,
    nextNumber: sequence.next_number,
    fullInvoiceNumber: buildFullInvoiceNumber(
      sequence.series,
      sequence.next_number,
      sequence.number_format
    ),
    invoiceDate: new Date().toISOString().slice(0, 10),
    buyer,
    vehicle,
    amounts,
  }
}

/**
 * Issue an invoice for a sale. Atomic + idempotent.
 *
 * Sequence (numeric example for REBU starting at 23):
 *   1. If an active invoice already exists for (dealId, type) → return it.
 *   2. If `idempotencyKey` was provided and matches an existing row → return
 *      that one.
 *   3. BEGIN; SELECT ... FOR UPDATE on invoice_sequences row.
 *   4. INSERT invoices row with status='PDF_PENDING', number = next_number.
 *   5. UPDATE invoice_sequences SET next_number = next_number + 1.
 *   6. COMMIT — at this point the number is reserved permanently.
 *   7. (Outside the tx) generate the PDF, upload to Vercel Blob.
 *   8. UPDATE invoices SET pdf_url, pdf_storage_key, status='ISSUED'.
 *
 * If step 7 or 8 fails, the row stays as PDF_PENDING and can be retried
 * via regeneratePdf() — the number is NOT reused.
 */
export async function issueInvoice(opts: IssueOptions): Promise<IssueResult> {
  // 1. Existing invoice for this (deal, type)?
  const existing = await getInvoiceByDealAndType(opts.dealId, opts.invoiceType)
  if (existing) {
    await ensureDealFlagged(existing)
    return { invoice: existing, alreadyExisted: true }
  }

  // 2. Idempotency-Key match?
  if (opts.idempotencyKey) {
    const byKey = await getInvoiceByIdempotencyKey(opts.idempotencyKey)
    if (byKey) {
      await ensureDealFlagged(byKey)
      return { invoice: byKey, alreadyExisted: true }
    }
  }

  // 3. Load sale + reserve number atomically
  const sale = await loadSale(opts.dealId)
  const buyer = buildBuyerSnapshot(sale)
  const vehicle = buildVehicleSnapshot(sale)
  const amounts = computeAmounts(sale.importeTotal ?? 0, opts.invoiceType)
  const invoiceDate = (opts.invoiceDate ?? new Date()).toISOString().slice(0, 10)

  const reserved = await reserveAndInsert({
    sale,
    invoiceType: opts.invoiceType,
    invoiceDate,
    buyer,
    vehicle,
    amounts,
    idempotencyKey: opts.idempotencyKey ?? null,
    notes: opts.notes ?? null,
    userId: opts.userId ?? null,
    userRole: opts.userRole ?? null,
  })

  if (reserved.alreadyExisted) {
    return { invoice: reserved.invoice, alreadyExisted: true }
  }

  // 4. Generate + upload PDF (best effort; row stays PDF_PENDING on failure)
  try {
    const pdf = await generatePdf(reserved.invoice, sale)
    const upload = await uploadPdfToBlob(reserved.invoice.full_invoice_number, pdf)

    const updated = await pool.query<Invoice>(
      `UPDATE invoices
       SET pdf_url = $1,
           pdf_storage_key = $2,
           pdf_generated_at = NOW(),
           status = 'ISSUED',
           updated_at = NOW()
       WHERE id = $3
       RETURNING *`,
      [upload.url, upload.pathname, reserved.invoice.id]
    )
    return { invoice: updated.rows[0], alreadyExisted: false }
  } catch (pdfError) {
    console.error(
      `[invoiceService] PDF generation/upload failed for invoice ${reserved.invoice.full_invoice_number}:`,
      pdfError
    )
    await pool.query(
      `INSERT INTO invoice_audit_logs (invoice_id, action, new_values_json, reason, user_id)
       VALUES ($1, 'STATUS_CHANGED', $2, $3, $4)`,
      [
        reserved.invoice.id,
        JSON.stringify({
          status: 'PDF_PENDING',
          error: (pdfError as Error)?.message ?? String(pdfError),
        }),
        'Fallo en generación o subida de PDF; número de factura reservado.',
        opts.userId ?? null,
      ]
    )
    return { invoice: reserved.invoice, alreadyExisted: false }
  }
}

/**
 * Regenerate the PDF of an existing invoice using the stored snapshot.
 * Does NOT touch the invoice number, the sequence, or any business amount.
 */
export async function regeneratePdf(
  invoiceId: number,
  reason: string,
  userId?: string | null,
  userRole?: string | null
): Promise<Invoice> {
  if (!reason || reason.trim().length < 3) {
    throw new InvoiceServiceError('REASON_REQUIRED', 'Es obligatorio indicar el motivo de la regeneración.')
  }

  const invoice = await getInvoiceById(invoiceId)
  if (!invoice) {
    throw new InvoiceServiceError('NOT_FOUND', 'Factura no encontrada.')
  }
  if (invoice.status === 'IMPORTED') {
    throw new InvoiceServiceError(
      'INVALID_STATUS',
      'Las facturas importadas como históricas no se pueden regenerar; los datos originales no están disponibles.'
    )
  }

  // Reconstruct the DealData shape that generarFactura expects from the
  // invoice snapshot, NOT from current Deal data — that's the whole point
  // of storing a snapshot.
  const pseudoDeal = invoiceToDealData(invoice)
  const tipoFactura = invoiceTypeToLegacy(invoice.invoice_type)

  const pdf = await generarFactura(
    pseudoDeal as never,
    tipoFactura,
    invoice.full_invoice_number
  )
  const upload = await uploadPdfToBlob(invoice.full_invoice_number, pdf)

  const updated = await pool.query<Invoice>(
    `UPDATE invoices
     SET pdf_url = $1,
         pdf_storage_key = $2,
         pdf_regenerated_at = NOW(),
         status = CASE WHEN status IN ('PDF_PENDING', 'ERROR') THEN 'ISSUED' ELSE status END,
         updated_at = NOW()
     WHERE id = $3
     RETURNING *`,
    [upload.url, upload.pathname, invoice.id]
  )

  await pool.query(
    `INSERT INTO invoice_audit_logs
       (invoice_id, action, new_values_json, reason, user_id, user_role)
     VALUES ($1, 'PDF_REGENERATED', $2, $3, $4, $5)`,
    [
      invoice.id,
      JSON.stringify({ pdf_url: upload.url, pdf_storage_key: upload.pathname }),
      reason,
      userId ?? null,
      userRole ?? null,
    ]
  )

  return updated.rows[0]
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

interface SaleSnapshot {
  id: number
  numero: string
  importeTotal: number | null
  fechaVentaFirmada: string | null
  cliente: {
    nombre: string | null
    apellidos: string | null
    dni: string | null
    telefono: string | null
    email: string | null
    direccion: string | null
    ciudad: string | null
    provincia: string | null
  }
  vehiculo: {
    id: number | null
    marca: string | null
    modelo: string | null
    matricula: string | null
    bastidor: string | null
    kms: number | null
    año: number | null
    fechaMatriculacion: string | null
    precioPublicacion: number | null
  }
}

interface Amounts {
  vehicle_sale_price: number
  taxable_base: number | null
  vat_rate: number | null
  vat_amount: number | null
  total_amount: number
  rebu_margin: number | null
  rebu_taxable_base: number | null
  rebu_vat_amount: number | null
}

async function loadSale(dealId: number): Promise<SaleSnapshot> {
  const res = await pool.query(
    `SELECT
       d.id, d.numero, d."importeTotal", d."fechaVentaFirmada",
       c.nombre AS cliente_nombre, c.apellidos AS cliente_apellidos,
       c.dni AS cliente_dni, c.telefono AS cliente_telefono, c.email AS cliente_email,
       c.direccion AS cliente_direccion, c.ciudad AS cliente_ciudad, c.provincia AS cliente_provincia,
       v.id AS vehiculo_id, v.marca, v.modelo, v.matricula, v.bastidor, v.kms,
       v."año" AS vehiculo_anio, v."fechaMatriculacion", v."precioPublicacion"
     FROM "Deal" d
     LEFT JOIN "Cliente" c  ON c.id = d."clienteId"
     LEFT JOIN "Vehiculo" v ON v.id = d."vehiculoId"
     WHERE d.id = $1`,
    [dealId]
  )
  const row = res.rows[0]
  if (!row) {
    throw new InvoiceServiceError('SALE_NOT_FOUND', `Venta (Deal) ${dealId} no encontrada.`)
  }

  return {
    id: row.id,
    numero: row.numero,
    importeTotal: row.importeTotal != null ? Number(row.importeTotal) : null,
    fechaVentaFirmada: row.fechaVentaFirmada
      ? new Date(row.fechaVentaFirmada).toISOString().slice(0, 10)
      : null,
    cliente: {
      nombre: row.cliente_nombre,
      apellidos: row.cliente_apellidos,
      dni: row.cliente_dni,
      telefono: row.cliente_telefono,
      email: row.cliente_email,
      direccion: row.cliente_direccion,
      ciudad: row.cliente_ciudad,
      provincia: row.cliente_provincia,
    },
    vehiculo: {
      id: row.vehiculo_id,
      marca: row.marca,
      modelo: row.modelo,
      matricula: row.matricula,
      bastidor: row.bastidor,
      kms: row.kms != null ? Number(row.kms) : null,
      año: row.vehiculo_anio,
      fechaMatriculacion: row.fechaMatriculacion
        ? new Date(row.fechaMatriculacion).toISOString().slice(0, 10)
        : null,
      precioPublicacion:
        row.precioPublicacion != null ? Number(row.precioPublicacion) : null,
    },
  }
}

function buildBuyerSnapshot(sale: SaleSnapshot) {
  const fullName = `${sale.cliente.nombre ?? ''} ${sale.cliente.apellidos ?? ''}`.trim()
  return {
    name: fullName || 'Cliente sin nombre',
    nif_cif: sale.cliente.dni ?? null,
    email: sale.cliente.email ?? null,
    address: [sale.cliente.direccion, sale.cliente.ciudad, sale.cliente.provincia]
      .filter(Boolean)
      .join(', ') || null,
  }
}

function buildVehicleSnapshot(sale: SaleSnapshot) {
  return {
    make: sale.vehiculo.marca ?? null,
    model: sale.vehiculo.modelo ?? null,
    plate: sale.vehiculo.matricula ?? null,
    vin: sale.vehiculo.bastidor ?? null,
    kms: sale.vehiculo.kms ?? null,
    year: sale.vehiculo.año ?? null,
  }
}

function computeAmounts(total: number, type: InvoiceType): Amounts {
  // Existing PDF generator's accounting rules (contractGenerator.ts:1704-1722):
  //  - VAT: total includes 21% VAT, taxable base = total / 1.21.
  //  - REBU: total has no VAT breakdown.
  // We persist the snapshot the gestor will read off the invoice history.
  if (type === 'VAT') {
    const rate = INVOICE_CONFIG.vat.standardRate
    const taxableBase = Number((total / (1 + rate / 100)).toFixed(2))
    const vatAmount = Number((total - taxableBase).toFixed(2))
    return {
      vehicle_sale_price: total,
      taxable_base: taxableBase,
      vat_rate: rate,
      vat_amount: vatAmount,
      total_amount: total,
      rebu_margin: null,
      rebu_taxable_base: null,
      rebu_vat_amount: null,
    }
  }
  // REBU: keep totals; margin/taxable_base/vat are accounting fields the
  // gestor may want later but the invoice itself does not show them.
  return {
    vehicle_sale_price: total,
    taxable_base: null,
    vat_rate: null,
    vat_amount: null,
    total_amount: total,
    rebu_margin: null,
    rebu_taxable_base: null,
    rebu_vat_amount: null,
  }
}

async function reserveAndInsert(args: {
  sale: SaleSnapshot
  invoiceType: InvoiceType
  invoiceDate: string
  buyer: ReturnType<typeof buildBuyerSnapshot>
  vehicle: ReturnType<typeof buildVehicleSnapshot>
  amounts: Amounts
  idempotencyKey: string | null
  notes: string | null
  userId: string | null
  userRole: string | null
}): Promise<{ invoice: Invoice; alreadyExisted: boolean }> {
  const client = await pool.connect()
  try {
    await client.query('BEGIN')

    // Lock the sequence row for this type
    const seqRes = await client.query(
      `SELECT id, series, next_number, number_format
       FROM invoice_sequences
       WHERE invoice_type = $1 AND is_active = TRUE
       ORDER BY year DESC, id DESC
       LIMIT 1
       FOR UPDATE`,
      [args.invoiceType]
    )
    if (seqRes.rows.length === 0) {
      throw new InvoiceServiceError(
        'NO_SEQUENCE',
        `No hay serie activa configurada para el tipo ${args.invoiceType}.`
      )
    }
    const seq = seqRes.rows[0]
    const seqNext = seq.next_number as number
    const series = seq.series as string

    // The seed migration (scripts/sql/0001-invoicing-module.sql) imports legacy
    // Deal.factura rows into the same series as the seeded sequence, so an
    // IMPORTED row's number can exceed next_number and collide with the
    // invoices_unique_series_number UNIQUE constraint on insert — freezing
    // issuance forever because the failed insert rolls back the sequence bump.
    // Skip past anything already in the series while still holding the lock.
    const maxRes = await client.query<{ max_num: number | null }>(
      `SELECT MAX(number)::INT AS max_num FROM invoices WHERE series = $1`,
      [series]
    )
    const maxExisting = maxRes.rows[0]?.max_num ?? 0
    const number = Math.max(seqNext, maxExisting + 1)
    if (number !== seqNext) {
      console.warn(
        `[invoiceService] fast-forwarding sequence ${series} (deal ${args.sale.id}): ${seqNext} -> ${number} (max existing: ${maxExisting})`
      )
    }
    const fullInvoiceNumber = `${series}-${formatNumber(number, seq.number_format)}`

    let inserted: Invoice
    try {
      const insertRes = await client.query<Invoice>(
        `INSERT INTO invoices (
           deal_id, vehiculo_id,
           invoice_type, series, number, full_invoice_number,
           invoice_date, operation_date,
           buyer_name, buyer_nif_cif, buyer_email, buyer_address,
           vehicle_make, vehicle_model, vehicle_plate, vehicle_vin, vehicle_kms, vehicle_year,
           vehicle_sale_price, taxable_base, vat_rate, vat_amount, total_amount,
           rebu_margin, rebu_taxable_base, rebu_vat_amount,
           status, idempotency_key, notes, created_by_user_id
         ) VALUES (
           $1, $2,
           $3, $4, $5, $6,
           $7, $8,
           $9, $10, $11, $12,
           $13, $14, $15, $16, $17, $18,
           $19, $20, $21, $22, $23,
           $24, $25, $26,
           'PDF_PENDING', $27, $28, $29
         )
         RETURNING *`,
        [
          args.sale.id,
          args.sale.vehiculo.id,
          args.invoiceType,
          series,
          number,
          fullInvoiceNumber,
          args.invoiceDate,
          args.sale.fechaVentaFirmada,
          args.buyer.name,
          args.buyer.nif_cif,
          args.buyer.email,
          args.buyer.address,
          args.vehicle.make,
          args.vehicle.model,
          args.vehicle.plate,
          args.vehicle.vin,
          args.vehicle.kms,
          args.vehicle.year,
          args.amounts.vehicle_sale_price,
          args.amounts.taxable_base,
          args.amounts.vat_rate,
          args.amounts.vat_amount,
          args.amounts.total_amount,
          args.amounts.rebu_margin,
          args.amounts.rebu_taxable_base,
          args.amounts.rebu_vat_amount,
          args.idempotencyKey,
          args.notes,
          args.userId,
        ]
      )
      inserted = insertRes.rows[0]
    } catch (err) {
      const e = err as { code?: string; constraint?: string }
      // Idempotency-key collision: another request raced us with the same key
      if (e?.code === '23505' && e?.constraint === 'invoices_unique_idempotency_key') {
        await client.query('ROLLBACK')
        const existing = await getInvoiceByIdempotencyKey(args.idempotencyKey!)
        if (existing) {
          return { invoice: existing, alreadyExisted: true }
        }
      }
      // Per-deal duplicate: another request already created the invoice
      if (e?.code === '23505' && e?.constraint?.includes('unique_per_sale')) {
        await client.query('ROLLBACK')
        const existing = await getInvoiceByDealAndType(args.sale.id, args.invoiceType)
        if (existing) {
          return { invoice: existing, alreadyExisted: true }
        }
      }
      throw err
    }

    // Advance the sequence past the number we just consumed (handles the
    // fast-forward case above; equivalent to `next_number + 1` otherwise).
    await client.query(
      `UPDATE invoice_sequences
       SET next_number = $1, updated_at = NOW()
       WHERE id = $2`,
      [number + 1, seq.id]
    )

    await client.query(
      `INSERT INTO invoice_audit_logs (invoice_id, action, new_values_json, user_id, user_role)
       VALUES ($1, 'CREATED', $2, $3, $4)`,
      [
        inserted.id,
        JSON.stringify({
          full_invoice_number: inserted.full_invoice_number,
          deal_id: inserted.deal_id,
          invoice_type: inserted.invoice_type,
          total_amount: inserted.total_amount,
        }),
        args.userId,
        args.userRole,
      ]
    )

    // Sincroniza el Deal con la factura recién emitida en el mismo tx
    // para que un fallo aquí haga rollback del INSERT + bump de secuencia.
    // COALESCE/NULLIF protege referencias legacy preexistentes (IMPORTED).
    await client.query(
      `UPDATE "Deal"
          SET estado = CASE WHEN estado <> 'facturado' THEN 'facturado' ELSE estado END,
              factura = COALESCE(NULLIF(factura, ''), $1),
              "fechaFacturada" = COALESCE("fechaFacturada", NOW())
        WHERE id = $2`,
      [inserted.full_invoice_number, args.sale.id]
    )

    await client.query('COMMIT')
    return { invoice: inserted, alreadyExisted: false }
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {})
    throw err
  } finally {
    client.release()
  }
}

async function generatePdf(
  invoice: Invoice,
  sale: SaleSnapshot
): Promise<Uint8Array> {
  // Build the DealData shape the existing generator expects, sourced from
  // the *snapshot* we just persisted so the PDF matches the invoice row.
  const dealData = invoiceToDealData(invoice, sale)
  const tipoFactura = invoiceTypeToLegacy(invoice.invoice_type)
  return generarFactura(dealData as never, tipoFactura, invoice.full_invoice_number)
}

function invoiceTypeToLegacy(type: InvoiceType): 'IVA' | 'REBU' {
  return type === 'REBU' ? 'REBU' : 'IVA'
}

function invoiceToDealData(invoice: Invoice, sale?: SaleSnapshot) {
  // Mirror the DealData interface of contractGenerator. We pull from the
  // invoice's snapshot first (so regeneration is stable) and only fall
  // back to a fresh sale lookup for fields not stored on the invoice row.
  const importeTotal = Number(invoice.total_amount)
  return {
    id: invoice.deal_id,
    numero: sale?.numero ?? `INV-${invoice.full_invoice_number}`,
    fechaCreacion: new Date(invoice.created_at),
    cliente: {
      nombre: invoice.buyer_name?.split(' ')[0] ?? '',
      apellidos: invoice.buyer_name?.split(' ').slice(1).join(' ') ?? '',
      dni: invoice.buyer_nif_cif ?? undefined,
      email: invoice.buyer_email ?? undefined,
      telefono: undefined,
      calle: invoice.buyer_address ?? undefined,
    },
    vehiculo: {
      marca: invoice.vehicle_make ?? '',
      modelo: invoice.vehicle_model ?? '',
      matricula: invoice.vehicle_plate ?? '',
      bastidor: invoice.vehicle_vin ?? undefined,
      precioPublicacion: importeTotal,
      fechaMatriculacion: undefined,
      año: invoice.vehicle_year ?? undefined,
    },
    importeTotal,
    importeSena: 0,
    formaPagoSena: undefined,
  }
}

/**
 * Self-heal helper for the idempotent return paths (existing invoice found).
 * Brings the Deal row in sync with an already-emitted invoice. No-op when:
 *  - invoice has no deal_id (legacy IMPORTED without link), or
 *  - invoice is VOIDED (would mis-flag a cancelled deal), or
 *  - Deal is already in a healthy state (CASE/COALESCE guards).
 */
async function ensureDealFlagged(invoice: Invoice): Promise<void> {
  if (!invoice.deal_id || invoice.status === 'VOIDED') return
  await pool.query(
    `UPDATE "Deal"
        SET estado = CASE WHEN estado <> 'facturado' THEN 'facturado' ELSE estado END,
            factura = COALESCE(NULLIF(factura, ''), $1),
            "fechaFacturada" = COALESCE("fechaFacturada", NOW())
      WHERE id = $2`,
    [invoice.full_invoice_number, invoice.deal_id]
  )
}

async function uploadPdfToBlob(
  fullInvoiceNumber: string,
  pdfBytes: Uint8Array
): Promise<{ url: string; pathname: string }> {
  // Prefijo "factura-" para que al descargar desde Vercel Blob el archivo
  // tenga un nombre humano (factura-F-2026-####.pdf) en lugar del crudo.
  const path = `${INVOICE_CONFIG.storage.blobPrefix}factura-${fullInvoiceNumber}.pdf`
  const blob = await put(path, Buffer.from(pdfBytes), {
    access: 'public',
    contentType: 'application/pdf',
    addRandomSuffix: false,
    allowOverwrite: true,
  })
  return { url: blob.url, pathname: blob.pathname }
}

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

export class InvoiceServiceError extends Error {
  constructor(public code: string, message: string) {
    super(message)
    this.name = 'InvoiceServiceError'
  }
}

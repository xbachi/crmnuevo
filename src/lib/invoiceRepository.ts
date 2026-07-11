/**
 * Read-side persistence for invoices and sequences.
 *
 * Write-side operations that involve correlative numbering live in
 * invoiceService.ts because they need transactions + row locks. Keep
 * this file purely query-driven so it can be used freely from any
 * route handler without lock contention.
 */

import { pool } from '@/lib/direct-database'

export type InvoiceType = 'VAT' | 'REBU' | 'RECTIFYING'

export type InvoiceStatus =
  | 'ISSUED'
  | 'PDF_PENDING'
  | 'ERROR'
  | 'VOIDED'
  | 'RECTIFIED'
  | 'IMPORTED'

export interface Invoice {
  id: number
  deal_id: number | null
  vehiculo_id: number | null
  b2b_venta_id: number | null

  invoice_type: InvoiceType
  series: string
  number: number
  full_invoice_number: string
  invoice_date: string
  operation_date: string | null

  buyer_name: string
  buyer_nif_cif: string | null
  buyer_email: string | null
  buyer_address: string | null

  vehicle_make: string | null
  vehicle_model: string | null
  vehicle_plate: string | null
  vehicle_vin: string | null
  vehicle_kms: number | null
  vehicle_year: number | null

  vehicle_sale_price: string
  taxable_base: string | null
  vat_rate: string | null
  vat_amount: string | null
  total_amount: string
  rebu_margin: string | null
  rebu_taxable_base: string | null
  rebu_vat_amount: string | null

  status: InvoiceStatus
  pdf_url: string | null
  pdf_storage_key: string | null
  pdf_generated_at: string | null
  pdf_regenerated_at: string | null

  idempotency_key: string | null

  notes: string | null
  metadata_json: Record<string, unknown> | null
  created_by_user_id: string | null
  created_at: string
  updated_at: string
}

export interface InvoiceSequence {
  id: number
  invoice_type: InvoiceType
  series: string
  year: number
  next_number: number
  /** Series floor for gap-filling number reuse; null on pre-0010 rows. */
  start_number: number | null
  number_format: string
  is_active: boolean
  created_at: string
  updated_at: string
}

export interface InvoiceListFilters {
  search?: string
  invoiceType?: InvoiceType
  year?: number
  status?: InvoiceStatus
  dealId?: number
  vehiculoId?: number
}

// Whitelisted column names for ORDER BY. The repo interpolates sortBy
// directly into the SQL string, so this set is the runtime guard against
// callers passing arbitrary input.
export const INVOICE_SORTABLE_COLUMNS = [
  'invoice_date',
  'number',
  'total_amount',
  'created_at',
  'invoice_type',
  'series',
  'buyer_name',
  'buyer_nif_cif',
  'vehicle_make',
  'vehicle_plate',
  'status',
] as const
export type InvoiceSortBy = (typeof INVOICE_SORTABLE_COLUMNS)[number]

export interface InvoiceListOptions extends InvoiceListFilters {
  page?: number
  pageSize?: number
  sortBy?: InvoiceSortBy
  sortDir?: 'asc' | 'desc'
}

export async function listInvoices(
  opts: InvoiceListOptions = {}
): Promise<{ rows: Invoice[]; total: number; page: number; pageSize: number }> {
  const page = Math.max(1, opts.page ?? 1)
  const pageSize = Math.min(200, Math.max(1, opts.pageSize ?? 50))
  const sortBy: InvoiceSortBy = (
    INVOICE_SORTABLE_COLUMNS as readonly string[]
  ).includes(opts.sortBy as string)
    ? (opts.sortBy as InvoiceSortBy)
    : 'invoice_date'
  const sortDir = opts.sortDir === 'asc' ? 'ASC' : 'DESC'

  const conditions: string[] = []
  const values: unknown[] = []
  const push = (clause: string, value: unknown) => {
    values.push(value)
    conditions.push(clause.replace('?', `$${values.length}`))
  }

  if (opts.search) {
    values.push(`%${opts.search.toLowerCase()}%`)
    const idx = values.length
    conditions.push(
      `(LOWER(full_invoice_number) LIKE $${idx} OR LOWER(buyer_name) LIKE $${idx} OR LOWER(vehicle_plate) LIKE $${idx} OR LOWER(buyer_nif_cif) LIKE $${idx})`
    )
  }
  if (opts.invoiceType) push('invoice_type = ?', opts.invoiceType)
  if (opts.year) push('EXTRACT(YEAR FROM invoice_date)::INT = ?', opts.year)
  if (opts.status) push('status = ?', opts.status)
  if (opts.dealId) push('deal_id = ?', opts.dealId)
  if (opts.vehiculoId) push('vehiculo_id = ?', opts.vehiculoId)

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : ''
  const offset = (page - 1) * pageSize

  const totalRes = await pool.query<{ c: string }>(
    `SELECT COUNT(*)::int AS c FROM invoices ${where}`,
    values
  )
  const total = parseInt(totalRes.rows[0]?.c ?? '0', 10)

  const dataRes = await pool.query<Invoice>(
    `SELECT * FROM invoices ${where}
     ORDER BY ${sortBy} ${sortDir}, id ${sortDir}
     LIMIT $${values.length + 1} OFFSET $${values.length + 2}`,
    [...values, pageSize, offset]
  )

  return { rows: dataRes.rows, total, page, pageSize }
}

export async function getInvoiceById(id: number): Promise<Invoice | null> {
  const res = await pool.query<Invoice>(`SELECT * FROM invoices WHERE id = $1`, [id])
  return res.rows[0] ?? null
}

export async function getInvoiceByDealAndType(
  dealId: number,
  invoiceType: InvoiceType
): Promise<Invoice | null> {
  const res = await pool.query<Invoice>(
    `SELECT * FROM invoices
     WHERE deal_id = $1 AND invoice_type = $2 AND status NOT IN ('VOIDED')
     ORDER BY id DESC LIMIT 1`,
    [dealId, invoiceType]
  )
  return res.rows[0] ?? null
}

export async function getInvoiceByIdempotencyKey(
  key: string
): Promise<Invoice | null> {
  const res = await pool.query<Invoice>(
    `SELECT * FROM invoices WHERE idempotency_key = $1`,
    [key]
  )
  return res.rows[0] ?? null
}

export async function listSequences(): Promise<InvoiceSequence[]> {
  const res = await pool.query<InvoiceSequence>(
    `SELECT * FROM invoice_sequences ORDER BY invoice_type, series`
  )
  return res.rows
}

export async function getSequenceByTypeAndSeries(
  invoiceType: InvoiceType,
  series: string
): Promise<InvoiceSequence | null> {
  const res = await pool.query<InvoiceSequence>(
    `SELECT * FROM invoice_sequences
     WHERE invoice_type = $1 AND series = $2 AND is_active = TRUE`,
    [invoiceType, series]
  )
  return res.rows[0] ?? null
}

/**
 * Find the active sequence for a given invoice type. Used when the user
 * issues an invoice and we need to figure out which series to use without
 * making the user pick one. There can be multiple active sequences per
 * type (e.g., one per year), so we prefer the most recent year.
 */
export async function getDefaultActiveSequence(
  invoiceType: InvoiceType
): Promise<InvoiceSequence | null> {
  const res = await pool.query<InvoiceSequence>(
    `SELECT * FROM invoice_sequences
     WHERE invoice_type = $1 AND is_active = TRUE
     ORDER BY year DESC, id DESC
     LIMIT 1`,
    [invoiceType]
  )
  return res.rows[0] ?? null
}

export interface ActiveVehicleInvoice {
  id: number
  full_invoice_number: string
  status: InvoiceStatus
  deal_id: number | null
  b2b_venta_id: number | null
  /** 'retail' when linked to a Deal, 'b2b' when linked to a venta_b2b. */
  origin: 'retail' | 'b2b'
}

/**
 * Finds an active (ISSUED/PDF_PENDING) sale invoice for a vehicle, across
 * BOTH retail (deal_id) and B2B (b2b_venta_id) origins. Used to guard against
 * the same car being invoiced twice from two different sale records — the
 * root cause of the R-2026-023/024 and R-2026-025/026 duplicates.
 *
 * `excludeDealId` / `excludeB2BVentaId` let the caller ignore its own sale
 * (e.g. a retry / re-issue of the very same deal must not flag itself).
 */
export async function findActiveSaleInvoiceForVehicle(
  vehiculoId: number,
  opts: { excludeDealId?: number; excludeB2BVentaId?: number } = {}
): Promise<ActiveVehicleInvoice | null> {
  const res = await pool.query<{
    id: number
    full_invoice_number: string
    status: InvoiceStatus
    deal_id: number | null
    b2b_venta_id: number | null
  }>(
    `SELECT id, full_invoice_number, status, deal_id, b2b_venta_id
       FROM invoices
      WHERE vehiculo_id = $1
        AND status IN ('ISSUED', 'PDF_PENDING')
        AND (deal_id IS NULL OR deal_id <> $2)
        AND (b2b_venta_id IS NULL OR b2b_venta_id <> $3)
      ORDER BY id DESC
      LIMIT 1`,
    [vehiculoId, opts.excludeDealId ?? -1, opts.excludeB2BVentaId ?? -1]
  )
  const row = res.rows[0]
  if (!row) return null
  return { ...row, origin: row.deal_id != null ? 'retail' : 'b2b' }
}

export async function getAuditLogsForInvoice(invoiceId: number) {
  const res = await pool.query(
    `SELECT * FROM invoice_audit_logs
     WHERE invoice_id = $1
     ORDER BY created_at DESC, id DESC`,
    [invoiceId]
  )
  return res.rows
}

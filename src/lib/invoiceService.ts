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
import {
  generarFactura,
  type GenerarFacturaOptions,
} from '@/lib/contractGenerator'
import { resolveNextNumber } from '@/lib/invoiceNumbering'
import { notifyGestoriaInvoice } from '@/lib/gestoriaWebhook'
import { notifyCostoBeneficio } from '@/lib/costoBeneficio'
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
  findActiveSaleInvoiceForVehicle,
  type Invoice,
  type InvoiceType,
} from '@/lib/invoiceRepository'
import { computeAmounts, type Amounts } from '@/lib/invoiceAmounts'
import { appendRegistro } from '@/lib/facturacionRegistro'
import { assertPeriodoAbierto, PeriodoCerradoError } from '@/lib/periodoLock'
import { crearExpedienteAlEmitir } from '@/lib/expedientes'
import { chequearRegimen, type AvisoRegimen } from '@/lib/origenCompra'

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
  /** Explicitly bypass the anti-duplicate-vehicle guard (legitimate resale). */
  allowDuplicate?: boolean
  /** Explicitly bypass the purchase-origin/VAT-regime guard: emitir con IVA un
   *  coche comprado a un particular (decisión fiscal consciente). */
  allowRegimen?: boolean
  /** Don't await the gestoría/costo-beneficio notifications inline: return them
   *  as `IssueResult.runNotifications` so the caller (a route handler) can run
   *  them with `after()` once the response is already on the wire. */
  deferNotifications?: boolean
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
  /** Régimen incoherente con el origen de la compra (o no verificable). El
   *  usuario elige el régimen ACÁ: el aviso tiene que verse en la vista previa,
   *  no sólo al chocar contra el error de la emisión. */
  avisoRegimen: AvisoRegimen | null
}

export interface IssueResult {
  invoice: Invoice
  /** True when the request was idempotent — an existing invoice was returned
   *  instead of creating a new one. */
  alreadyExisted: boolean
  /** True when a duplicate-vehicle invoice was found but the caller passed
   *  allowDuplicate:true to proceed anyway (legitimate resale). */
  duplicateOverride?: boolean
  /** Aviso no bloqueante (origen de la compra no verificable) para que la UI lo
   *  muestre después de emitir. Los bloqueantes lanzan REGIMEN_INCOHERENTE. */
  avisoRegimen?: AvisoRegimen | null
  /** Only set when `deferNotifications:true`. Off the critical path: the invoice
   *  already exists and already has its fiscal number, so the caller must send
   *  the response first and run this with `after()`. Never throws. */
  runNotifications?: () => Promise<void>
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

  // Mirror the issuance rule (gap-filling) so the preview shows the number
  // that will actually be assigned — including a freed/deleted number that
  // will be reused. No lock here: a concurrent issue may still take it.
  const startNumber = sequence.start_number ?? sequence.next_number
  const number = await resolveNextNumber(pool, sequence.series, startNumber)

  // Coherencia régimen ↔ origen de la compra. Nunca lanza acá: la vista previa
  // informa, la emisión es la que bloquea.
  const avisoRegimen = await chequearRegimen(pool, {
    invoiceType,
    total: amounts.total_amount,
    vehiculoId: sale.vehiculo.id,
    matricula: sale.vehiculo.matricula,
  })

  return {
    invoiceType,
    series: sequence.series,
    nextNumber: number,
    fullInvoiceNumber: buildFullInvoiceNumber(
      sequence.series,
      number,
      sequence.number_format
    ),
    invoiceDate: new Date().toISOString().slice(0, 10),
    buyer,
    vehicle,
    amounts,
    avisoRegimen,
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
  const invoiceDate = (opts.invoiceDate ?? new Date())
    .toISOString()
    .slice(0, 10)

  // 3a. Cierre mensual: una factura no puede caer en un mes ya entregado a la
  // gestoría (auditoría 2T: ventas de abril contadas en marzo). La lib devuelve
  // "abierto" si la tabla periodos_contables aún no existe.
  try {
    await assertPeriodoAbierto(
      pool,
      invoiceDate,
      'No se puede emitir la factura'
    )
  } catch (err) {
    if (err instanceof PeriodoCerradoError) {
      throw new InvoiceServiceError('PERIODO_CERRADO', err.message, {
        anio: err.anio,
        mes: err.mes,
      })
    }
    throw err
  }

  // 3b. Anti-duplicate-vehicle guard: the same car must not get two active
  // sale invoices from two different deals/ventas (root cause of the
  // R-2026-023/024 and R-2026-025/026 incidents). Skippable with
  // allowDuplicate:true for a genuine resale of the same vehicle.
  let duplicateOverride = false
  if (sale.vehiculo.id != null) {
    const conflict = await findActiveSaleInvoiceForVehicle(sale.vehiculo.id, {
      excludeDealId: opts.dealId,
    })
    if (conflict) {
      if (!opts.allowDuplicate) {
        const origen =
          conflict.deal_id != null
            ? `deal ${conflict.deal_id}`
            : conflict.b2b_venta_id != null
              ? `venta B2B ${conflict.b2b_venta_id}`
              : conflict.origin
        throw new InvoiceServiceError(
          'VEHICLE_ALREADY_INVOICED',
          `Este coche ya está facturado en ${conflict.full_invoice_number} (${origen}). Emitir otra factura del mismo coche es una duplicación fiscal.`,
          {
            existingInvoiceId: conflict.id,
            fullInvoiceNumber: conflict.full_invoice_number,
            origin: conflict.origin,
            status: conflict.status,
            dealId: conflict.deal_id,
            b2bVentaId: conflict.b2b_venta_id,
          }
        )
      }
      duplicateOverride = true
      console.warn(
        `[invoiceService] duplicate-vehicle override for deal ${opts.dealId}: vehiculo ${sale.vehiculo.id} already invoiced as ${conflict.full_invoice_number} (${conflict.origin}); proceeding because allowDuplicate=true`
      )
    }
  }

  // 3c. Coherencia régimen ↔ origen de la compra: un coche comprado a un
  // particular (contrato, sin factura) facturado con IVA general ingresa IVA
  // sobre el precio TOTAL en vez de sobre el margen (caso VW Taigo: 3.210,74 €
  // de más). Va ANTES de reservar número: un bloqueo no puede quemar un número
  // fiscal. Si el origen no se puede verificar, avisa pero NO bloquea.
  const avisoRegimen = await chequearRegimen(pool, {
    invoiceType: opts.invoiceType,
    total: amounts.total_amount,
    vehiculoId: sale.vehiculo.id,
    matricula: sale.vehiculo.matricula,
  })
  if (avisoRegimen?.severidad === 'bloqueante') {
    if (!opts.allowRegimen) {
      throw new InvoiceServiceError(
        'REGIMEN_INCOHERENTE',
        avisoRegimen.message,
        {
          origen: avisoRegimen.origen,
          invoiceType: avisoRegimen.invoiceType,
          total: avisoRegimen.total,
          precioCompra: avisoRegimen.precioCompra,
          ivaGeneral: avisoRegimen.ivaGeneral,
          ivaRebu: avisoRegimen.ivaRebu,
          diferencia: avisoRegimen.diferencia,
        }
      )
    }
    console.warn(
      `[invoiceService] regimen override for deal ${opts.dealId}: coche comprado a particular facturado con IVA (diferencia estimada ${avisoRegimen.diferencia ?? '?'} €); proceeding because allowRegimen=true`
    )
  } else if (avisoRegimen) {
    console.warn(
      `[invoiceService] deal ${opts.dealId}: ${avisoRegimen.code} — ${avisoRegimen.message}`
    )
  }

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

  // Sólo los avisos (origen no verificable) viajan al cliente: los bloqueantes
  // ya lanzaron más arriba, o el usuario los forzó a conciencia.
  const aviso = avisoRegimen?.severidad === 'aviso' ? avisoRegimen : null

  if (reserved.alreadyExisted) {
    return {
      invoice: reserved.invoice,
      alreadyExisted: true,
      duplicateOverride,
      avisoRegimen: aviso,
    }
  }

  // Best-effort: expediente (deal jacket) de la venta, FUERA de la transacción
  // de numeración. La emisión nunca falla por el expediente; si el INSERT
  // falla, el backfill/recalcular lo repone después.
  const stage = stageTimer(reserved.invoice.full_invoice_number)
  try {
    await crearExpedienteAlEmitir(pool, {
      invoiceType: opts.invoiceType,
      dealId: opts.dealId,
      vehiculoId: sale.vehiculo.id,
      matricula: sale.vehiculo.matricula,
      numeroFactura: reserved.invoice.full_invoice_number,
      invoiceDate,
    })
  } catch (expedienteError) {
    console.error(
      `[invoiceService] expediente creation failed for ${reserved.invoice.full_invoice_number}:`,
      expedienteError
    )
  }
  stage('expediente')

  // 4. Generate + upload PDF (best effort; row stays PDF_PENDING on failure).
  //    El PDF y el blob SÍ van inline: el usuario lo descarga al instante.
  try {
    const pdf = await generatePdf(reserved.invoice, sale)
    stage('pdf')
    const upload = await uploadPdfToBlob(
      reserved.invoice.full_invoice_number,
      pdf
    )
    stage('blob')

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
    stage('update')

    // Archivado en OneDrive/GESTORIA (n8n, PDF en base64 → rclone) + bloque
    // coste/beneficio en Google Sheets. Los dos son lentos (segundos, a veces
    // decenas) y NINGUNO es necesario para responderle al usuario: la factura
    // ya existe, ya tiene número fiscal y ya tiene PDF. Best-effort: ninguno
    // lanza (dejan traza en webhook_outbox).
    const runNotifications = async () => {
      try {
        await notifyGestoriaInvoice({
          numeroFactura: reserved.invoice.full_invoice_number,
          fechaISO: invoiceDate,
          matricula: vehicle.plate,
          marca: vehicle.make,
          modelo: vehicle.model,
          tipo: opts.invoiceType,
          pdfBase64: Buffer.from(pdf).toString('base64'),
        })
        stage('notify:gestoria')
        await notifyCostoBeneficio({
          dealId: opts.dealId,
          numeroFactura: reserved.invoice.full_invoice_number,
          invoiceType: opts.invoiceType,
          invoiceDate,
          salePrice: amounts.total_amount,
        })
        stage('notify:costobeneficio')
      } catch (notifyError) {
        console.error(
          `[invoiceService] notifications failed for ${reserved.invoice.full_invoice_number}:`,
          notifyError
        )
      }
    }

    if (opts.deferNotifications) {
      return {
        invoice: updated.rows[0],
        alreadyExisted: false,
        duplicateOverride,
        avisoRegimen: aviso,
        runNotifications,
      }
    }

    await runNotifications()
    return {
      invoice: updated.rows[0],
      alreadyExisted: false,
      duplicateOverride,
      avisoRegimen: aviso,
    }
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
    return {
      invoice: reserved.invoice,
      alreadyExisted: false,
      duplicateOverride,
      avisoRegimen: aviso,
    }
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
    throw new InvoiceServiceError(
      'REASON_REQUIRED',
      'Es obligatorio indicar el motivo de la regeneración.'
    )
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
  const pdf = await buildInvoicePdf(invoice)
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

/** Duración por etapa de la emisión, para poder ver en los logs de Vercel dónde
 *  se va el tiempo (el PDF y el blob son inline; las notificaciones no). */
function stageTimer(invoiceNumber: string) {
  let last = Date.now()
  const start = last
  return (name: string) => {
    const now = Date.now()
    console.log(
      `[invoiceService] ${invoiceNumber} ${name}=${now - last}ms total=${now - start}ms`
    )
    last = now
  }
}

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
    throw new InvoiceServiceError(
      'SALE_NOT_FOUND',
      `Venta (Deal) ${dealId} no encontrada.`
    )
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
  const fullName =
    `${sale.cliente.nombre ?? ''} ${sale.cliente.apellidos ?? ''}`.trim()
  return {
    name: fullName || 'Cliente sin nombre',
    nif_cif: sale.cliente.dni ?? null,
    email: sale.cliente.email ?? null,
    address:
      [sale.cliente.direccion, sale.cliente.ciudad, sale.cliente.provincia]
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
      `SELECT id, series, next_number, number_format, start_number
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

    // Gap-filling number assignment (while holding the sequence lock):
    //  - Reuse the lowest free number in [start_number, system max] so an
    //    invoice deleted by an admin gets its number re-occupied (no gaps).
    //  - Otherwise take the next correlative, jumping over any legacy IMPORTED
    //    row above the system max so we never hit invoices_unique_series_number.
    // start_number is the series floor; legacy IMPORTED rows live below it and
    // are never disturbed. See invoiceNumbering.pickInvoiceNumber.
    const startNumber = (seq.start_number as number | null) ?? seqNext
    const number = await resolveNextNumber(client, series, startNumber)
    if (number !== seqNext) {
      console.warn(
        `[invoiceService] sequence ${series} (deal ${args.sale.id}): assigning ${number} (next_number was ${seqNext})`
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
      if (
        e?.code === '23505' &&
        e?.constraint === 'invoices_unique_idempotency_key'
      ) {
        await client.query('ROLLBACK')
        const existing = await getInvoiceByIdempotencyKey(args.idempotencyKey!)
        if (existing) {
          return { invoice: existing, alreadyExisted: true }
        }
      }
      // Per-deal duplicate: another request already created the invoice
      if (e?.code === '23505' && e?.constraint?.includes('unique_per_sale')) {
        await client.query('ROLLBACK')
        const existing = await getInvoiceByDealAndType(
          args.sale.id,
          args.invoiceType
        )
        if (existing) {
          return { invoice: existing, alreadyExisted: true }
        }
      }
      throw err
    }

    // Advance the sequence high-water mark. GREATEST keeps next_number
    // monotonic (never regresses) even when we reused a lower freed number,
    // preserving the no-regression invariant the admin sequence editor relies
    // on. The real source of truth for the next number is the gap-fill scan.
    await client.query(
      `UPDATE invoice_sequences
       SET next_number = GREATEST(next_number, $1), updated_at = NOW()
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

    // Cadena de integridad "Verifactu-lite" (pendiente de homologación):
    // eslabón 'alta' en el MISMO tx que reserva el número e inserta la
    // factura. Si falla, la emisión entera hace rollback — una factura sin
    // eslabón en la cadena no debe existir.
    await appendRegistro(client, {
      tipoRegistro: 'alta',
      invoiceId: inserted.id,
      numeroSerie: inserted.full_invoice_number,
      fechaExpedicion: args.invoiceDate,
      importeTotal: args.amounts.total_amount,
      metadata: {
        origen: 'retail',
        deal_id: args.sale.id,
        invoice_type: args.invoiceType,
      },
    })

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

/**
 * Bytes del PDF de UNA factura, a partir de su snapshot (nunca de los datos
 * vivos del Deal). Único punto que sabe traducir una fila de `invoices` a los
 * parámetros del generador, incluidas las dos variantes documentales:
 *
 *   · RECTIFYING → "FACTURA RECTIFICATIVA": sello diagonal, importes en
 *     negativo, referencia a la original (número Y fecha), motivo y cita del
 *     art. 15 RD 1619/2012. El régimen (IVA/REBU) se HEREDA de la original.
 *   · RECTIFIED  → la original que ya fue anulada: sello "ANULADA" y la
 *     referencia a la rectificativa. Quien imprima hoy la original vieja tiene
 *     que ver que está sin efecto.
 */
export async function buildInvoicePdf(
  invoice: Invoice,
  sale?: SaleSnapshot
): Promise<Uint8Array> {
  const dealData = invoiceToDealData(invoice, sale)
  const options: GenerarFacturaOptions = {
    fechaFactura: toLocalDate(invoice.invoice_date),
  }
  let tipoFactura = invoiceTypeToLegacy(invoice.invoice_type)

  if (invoice.invoice_type === 'RECTIFYING') {
    const original = invoice.rectifies_invoice_id
      ? await getInvoiceById(invoice.rectifies_invoice_id)
      : null
    // Invariante de invoiceRectificativa: RECTIFYING con taxable_base NULL
    // ⇔ rectifica una REBU (sin desglose de IVA en el documento).
    tipoFactura = invoice.taxable_base == null ? 'REBU' : 'IVA'
    options.rectificativa = {
      numeroOriginal: original?.full_invoice_number ?? '—',
      fechaOriginal: formatFechaES(original?.invoice_date),
      motivo: invoice.rectification_reason ?? 'No especificado',
    }
  } else if (
    invoice.status === 'RECTIFIED' &&
    invoice.rectified_by_invoice_id
  ) {
    const rectificativa = await getInvoiceById(invoice.rectified_by_invoice_id)
    if (rectificativa) {
      options.anuladaPor = {
        numeroRectificativa: rectificativa.full_invoice_number,
        fechaRectificativa: formatFechaES(rectificativa.invoice_date),
      }
    }
  }

  return generarFactura(
    dealData as never,
    tipoFactura,
    invoice.full_invoice_number,
    options
  )
}

/**
 * Genera el PDF de una factura ya emitida, lo sube a Blob y actualiza la fila.
 * NO toca número, secuencia ni importes. Usado por la emisión normal y por la
 * rectificativa (que hasta ahora quedaba en PDF_PENDING sin documento).
 */
export async function generateAndAttachPdf(
  invoice: Invoice
): Promise<{ invoice: Invoice; pdf: Uint8Array }> {
  const pdf = await buildInvoicePdf(invoice)
  const upload = await uploadPdfToBlob(invoice.full_invoice_number, pdf)
  const updated = await pool.query<Invoice>(
    `UPDATE invoices
        SET pdf_url = $1,
            pdf_storage_key = $2,
            pdf_generated_at = COALESCE(pdf_generated_at, NOW()),
            status = CASE WHEN status IN ('PDF_PENDING', 'ERROR') THEN 'ISSUED' ELSE status END,
            updated_at = NOW()
      WHERE id = $3
      RETURNING *`,
    [upload.url, upload.pathname, invoice.id]
  )
  return { invoice: updated.rows[0] ?? invoice, pdf }
}

async function generatePdf(
  invoice: Invoice,
  sale: SaleSnapshot
): Promise<Uint8Array> {
  // Build the DealData shape the existing generator expects, sourced from
  // the *snapshot* we just persisted so the PDF matches the invoice row.
  return buildInvoicePdf(invoice, sale)
}

function invoiceTypeToLegacy(type: InvoiceType): 'IVA' | 'REBU' {
  return type === 'REBU' ? 'REBU' : 'IVA'
}

/** DATE de Postgres (string 'YYYY-MM-DD' o Date) → Date local, sin corrimiento
 *  de zona horaria (`new Date('2026-03-05')` es medianoche UTC). */
function toLocalDate(
  value: string | Date | null | undefined
): Date | undefined {
  if (!value) return undefined
  if (value instanceof Date) return value
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(value))
  return m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : undefined
}

/** DATE de Postgres → 'DD/MM/AAAA'. */
export function formatFechaES(value: string | Date | null | undefined): string {
  const d = toLocalDate(value)
  return d ? d.toLocaleDateString('es-ES') : '—'
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
  // addRandomSuffix=true para que la URL pública del blob NO sea adivinable
  // (mitigación de exposición — el path real se guarda en pdf_storage_key y
  // la URL canónica de descarga es /api/invoices/[id]/download que pasa por
  // middleware auth).
  const path = `${INVOICE_CONFIG.storage.blobPrefix}factura-${fullInvoiceNumber}.pdf`
  const blob = await put(path, Buffer.from(pdfBytes), {
    access: 'public',
    contentType: 'application/pdf',
    addRandomSuffix: true,
    allowOverwrite: true,
  })
  return { url: blob.url, pathname: blob.pathname }
}

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

export class InvoiceServiceError extends Error {
  constructor(
    public code: string,
    message: string,
    public details?: Record<string, unknown>
  ) {
    super(message)
    this.name = 'InvoiceServiceError'
  }
}

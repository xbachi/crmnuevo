/**
 * Emisión de facturas B2B.
 *
 * Comparte la tabla `invoices` y la misma secuencia fiscal (REBU/IVA) que el
 * flujo retail, pero se origina desde `venta_b2b` (no desde Deal). Por eso:
 *   - El INSERT lleva b2b_venta_id en vez de deal_id.
 *   - NO actualiza la tabla Deal (no hay deal).
 *   - Idempotente por venta_b2b_id (ver índice del 0006).
 *
 * Por defecto las B2B son REBU (sin desglose de IVA) — coincide con el flujo
 * "compraventa en el estado". Si el usuario necesita VAT, la API lo acepta.
 */

import { put } from '@vercel/blob'
import { pool } from '@/lib/direct-database'
import { generarFactura } from '@/lib/contractGenerator'
import { INVOICE_CONFIG, formatNumber } from '@/config/invoiceConfig'
import { findActiveSaleInvoiceForVehicle, type Invoice, type InvoiceType } from '@/lib/invoiceRepository'
import { InvoiceServiceError } from '@/lib/invoiceService'
import { getVentaB2BById } from '@/lib/b2b-database'
import { crearExpedienteAlEmitir } from '@/lib/expedientes'

export interface IssueB2BOptions {
  ventaB2BId: number
  invoiceType: InvoiceType // 'REBU' (default) | 'VAT'
  idempotencyKey?: string | null
  /** Explicitly bypass the anti-duplicate-vehicle guard (legitimate resale). */
  allowDuplicate?: boolean
}

export interface IssueB2BResult {
  invoice: Invoice
  alreadyExisted: boolean
  duplicateOverride?: boolean
}

/**
 * Verifica si ya hay una factura emitida (no anulada) para una venta B2B.
 */
async function getInvoiceByB2BVentaId(ventaId: number): Promise<Invoice | null> {
  const { rows } = await pool.query<Invoice>(
    `SELECT * FROM invoices
      WHERE b2b_venta_id = $1 AND status <> 'VOIDED'
      ORDER BY id DESC
      LIMIT 1`,
    [ventaId]
  )
  return rows[0] ?? null
}

export async function issueInvoiceForB2B(
  opts: IssueB2BOptions
): Promise<IssueB2BResult> {
  // 1) Idempotencia: ya hay factura para esta venta?
  const existing = await getInvoiceByB2BVentaId(opts.ventaB2BId)
  if (existing) {
    return { invoice: existing, alreadyExisted: true }
  }

  // 2) Cargar venta + cliente
  const venta = await getVentaB2BById(opts.ventaB2BId)
  if (!venta) {
    throw new InvoiceServiceError(
      'SALE_NOT_FOUND',
      `Venta B2B ${opts.ventaB2BId} no encontrada.`
    )
  }

  // 2b) Anti-duplicate-vehicle guard, cruzado con retail (mismo bug que dio
  // origen a R-2026-025/026: un Opel Zafira/VW Eos facturado dos veces desde
  // dos ventas distintas). Saltable con allowDuplicate:true.
  let duplicateOverride = false
  if (venta.vehiculo_id != null) {
    const conflict = await findActiveSaleInvoiceForVehicle(venta.vehiculo_id, {
      excludeB2BVentaId: opts.ventaB2BId,
    })
    if (conflict) {
      if (!opts.allowDuplicate) {
        throw new InvoiceServiceError(
          'VEHICLE_ALREADY_INVOICED',
          `El vehículo ya tiene una factura de venta activa (${conflict.full_invoice_number}, origen ${conflict.origin}).`,
          {
            existingInvoiceId: conflict.id,
            fullInvoiceNumber: conflict.full_invoice_number,
            origin: conflict.origin,
            status: conflict.status,
          }
        )
      }
      duplicateOverride = true
      console.warn(
        `[b2b-invoice-service] duplicate-vehicle override for venta B2B ${opts.ventaB2BId}: vehiculo ${venta.vehiculo_id} already invoiced as ${conflict.full_invoice_number} (${conflict.origin}); proceeding because allowDuplicate=true`
      )
    }
  }

  const precio = Number(venta.precio_venta)
  let subtotal: number, vatRate: number | null, vatAmount: number | null
  if (opts.invoiceType === 'VAT') {
    vatRate = INVOICE_CONFIG.vat.standardRate
    subtotal = Number((precio / (1 + vatRate / 100)).toFixed(2))
    vatAmount = Number((precio - subtotal).toFixed(2))
  } else {
    subtotal = precio
    vatRate = null
    vatAmount = null
  }

  const client = await pool.connect()
  let inserted: Invoice
  try {
    await client.query('BEGIN')

    // 3) Reservar número de la secuencia (mismo patrón que retail)
    const seqRes = await client.query(
      `SELECT id, series, next_number, number_format
         FROM invoice_sequences
        WHERE invoice_type = $1 AND is_active = TRUE
        ORDER BY year DESC, id DESC
        LIMIT 1
        FOR UPDATE`,
      [opts.invoiceType]
    )
    if (seqRes.rows.length === 0) {
      throw new InvoiceServiceError(
        'NO_SEQUENCE',
        `No hay serie activa configurada para el tipo ${opts.invoiceType}.`
      )
    }
    const seq = seqRes.rows[0]
    const series = seq.series as string
    const maxRes = await client.query<{ max_num: number | null }>(
      `SELECT MAX(number)::INT AS max_num FROM invoices WHERE series = $1`,
      [series]
    )
    const maxExisting = maxRes.rows[0]?.max_num ?? 0
    const number = Math.max(seq.next_number as number, maxExisting + 1)
    const fullInvoiceNumber = `${series}-${formatNumber(number, seq.number_format)}`

    // 4) INSERT en invoices (sin deal_id, con b2b_venta_id)
    const invoiceDate = new Date().toISOString().slice(0, 10)
    try {
      const insertRes = await client.query<Invoice>(
        `INSERT INTO invoices (
           deal_id, vehiculo_id, b2b_venta_id,
           invoice_type, series, number, full_invoice_number,
           invoice_date, operation_date,
           buyer_name, buyer_nif_cif, buyer_email, buyer_address,
           vehicle_make, vehicle_model, vehicle_plate, vehicle_vin, vehicle_kms, vehicle_year,
           vehicle_sale_price, taxable_base, vat_rate, vat_amount, total_amount,
           status, idempotency_key, notes
         ) VALUES (
           NULL, $1, $2,
           $3, $4, $5, $6,
           $7, $8,
           $9, $10, NULL, NULL,
           $11, $12, $13, $14, $15, $16,
           $17, $18, $19, $20, $21,
           'PDF_PENDING', $22, $23
         )
         RETURNING *`,
        [
          venta.vehiculo_id ?? null,
          venta.id,
          opts.invoiceType,
          series,
          number,
          fullInvoiceNumber,
          invoiceDate,
          venta.fecha_venta,
          venta.cliente_razon_social,
          venta.cliente_cif_nif,
          venta.vehiculo_marca,
          venta.vehiculo_modelo,
          venta.vehiculo_matricula,
          venta.vehiculo_bastidor,
          venta.vehiculo_kms,
          venta.vehiculo_anio,
          precio,
          opts.invoiceType === 'VAT' ? subtotal : null,
          vatRate,
          vatAmount,
          precio,
          opts.idempotencyKey ?? null,
          `B2B venta ${venta.numero}`,
        ]
      )
      inserted = insertRes.rows[0]
    } catch (err) {
      const e = err as { code?: string; constraint?: string }
      if (
        e?.code === '23505' &&
        e?.constraint === 'idx_invoices_unique_per_b2b_venta'
      ) {
        await client.query('ROLLBACK')
        const existing2 = await getInvoiceByB2BVentaId(opts.ventaB2BId)
        if (existing2) return { invoice: existing2, alreadyExisted: true }
      }
      throw err
    }

    // 5) Avanzar la secuencia
    await client.query(
      `UPDATE invoice_sequences SET next_number = $1, updated_at = NOW() WHERE id = $2`,
      [number + 1, seq.id]
    )

    // 6) Audit log
    await client.query(
      `INSERT INTO invoice_audit_logs (invoice_id, action, new_values_json)
       VALUES ($1, 'CREATED', $2)`,
      [
        inserted.id,
        JSON.stringify({
          full_invoice_number: inserted.full_invoice_number,
          b2b_venta_id: venta.id,
          venta_numero: venta.numero,
          invoice_type: opts.invoiceType,
          total_amount: precio,
        }),
      ]
    )

    await client.query('COMMIT')
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {})
    throw err
  } finally {
    client.release()
  }

  // 6b) Best-effort: expediente (deal jacket) de la venta, fuera del tx de
  // numeración. Nunca rompe la emisión.
  try {
    await crearExpedienteAlEmitir(pool, {
      invoiceType: opts.invoiceType,
      b2bVentaId: venta.id,
      vehiculoId: venta.vehiculo_id ?? null,
      matricula: venta.vehiculo_matricula ?? null,
      numeroFactura: inserted.full_invoice_number,
      invoiceDate: inserted.invoice_date ?? null,
    })
  } catch (expedienteError) {
    console.error(
      `[issueInvoiceForB2B] expediente creation failed for ${inserted.full_invoice_number}:`,
      expedienteError
    )
  }

  // 7) Generar PDF + subir a Vercel Blob (fuera del tx)
  try {
    const dealData = {
      id: inserted.id,
      numero: venta.numero,
      fechaCreacion: new Date(),
      cliente: {
        nombre: venta.cliente_razon_social.split(' ')[0] ?? venta.cliente_razon_social,
        apellidos: venta.cliente_razon_social
          .split(' ')
          .slice(1)
          .join(' '),
        dni: venta.cliente_cif_nif,
      },
      vehiculo: {
        marca: venta.vehiculo_marca ?? '',
        modelo: venta.vehiculo_modelo ?? '',
        matricula: venta.vehiculo_matricula ?? '',
        bastidor: venta.vehiculo_bastidor ?? '',
        kms: venta.vehiculo_kms ?? 0,
        año: venta.vehiculo_anio ?? undefined,
        fechaMatriculacion: venta.vehiculo_fecha_matriculacion ?? undefined,
      },
      importeTotal: precio,
      importeSena: 0,
    }
    const pdfBytes = await generarFactura(
      dealData as never,
      opts.invoiceType === 'VAT' ? 'IVA' : 'REBU',
      inserted.full_invoice_number,
      { skipGarantia: true } // B2B = "en el estado", sin garantía
    )

    const path = `${INVOICE_CONFIG.storage.blobPrefix}factura-${inserted.full_invoice_number}.pdf`
    const blob = await put(path, Buffer.from(pdfBytes), {
      access: 'public',
      contentType: 'application/pdf',
      addRandomSuffix: true, // URL unguessable; descarga real va por /api/.../factura (auth)
      allowOverwrite: true,
    })

    const updated = await pool.query<Invoice>(
      `UPDATE invoices
          SET pdf_url = $1, pdf_storage_key = $2,
              pdf_generated_at = NOW(), status = 'ISSUED', updated_at = NOW()
        WHERE id = $3
        RETURNING *`,
      [blob.url, blob.pathname, inserted.id]
    )
    return { invoice: updated.rows[0], alreadyExisted: false, duplicateOverride }
  } catch (pdfErr) {
    console.error('[issueInvoiceForB2B] PDF/Blob failed:', pdfErr)
    await pool.query(
      `INSERT INTO invoice_audit_logs (invoice_id, action, new_values_json, reason)
       VALUES ($1, 'STATUS_CHANGED', $2, $3)`,
      [
        inserted.id,
        JSON.stringify({ status: 'PDF_PENDING', error: (pdfErr as Error)?.message }),
        'Fallo en generación o subida de PDF; número fiscal ya reservado.',
      ]
    )
    return { invoice: inserted, alreadyExisted: false, duplicateOverride }
  }
}

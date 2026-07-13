/**
 * Facturas rectificativas — anulación formal de una factura mal emitida.
 *
 * Regla dura: una factura NO se borra. La numeración es correlativa y un hueco
 * es un problema fiscal. Se emite una RECTIFICATIVA (serie propia FR, la letra
 * R ya es de REBU) con importe NEGATIVO que referencia a la original:
 *
 *   original  F-2026-0031  +12.100,00   → status RECTIFIED (conserva su número)
 *   rectific. FR-2026-001  -12.100,00   → invoice_type RECTIFYING
 *
 * Semántica en los consumidores:
 *   · Libro IVA / manifiesto → las DOS filas (netean a cero). Es lo que la
 *     gestora necesita ver.
 *   · Conteos operativos (comisiones, chequeo de expedientes, CB) → NINGUNA
 *     de las dos. Una venta duplicada no es una venta.
 *
 * Cadena Verifactu-lite: dos eslabones en la MISMA transacción — 'alta' de la
 * rectificativa y 'anulacion' de la original. Si la cadena falla, rollback de
 * todo (mismo criterio que la emisión normal).
 *
 * PDF: NO se genera acá (el generador sólo entiende IVA/REBU en positivo). La
 * rectificativa queda en PDF_PENDING con el número ya reservado.
 */

import type { PoolClient } from 'pg'
import { pool } from '@/lib/direct-database'
import { formatNumber } from '@/config/invoiceConfig'
import { resolveNextNumber } from '@/lib/invoiceNumbering'
import { computeAmounts, type Amounts } from '@/lib/invoiceAmounts'
import { appendRegistro } from '@/lib/facturacionRegistro'
import { assertPeriodoAbierto, PeriodoCerradoError } from '@/lib/periodoLock'
import type { Invoice, InvoiceStatus, InvoiceType } from '@/lib/invoiceRepository'

export class RectificarError extends Error {
  constructor(
    public code: string,
    message: string,
    public httpStatus: number,
    public details?: Record<string, unknown>
  ) {
    super(message)
    this.name = 'RectificarError'
  }
}

/** Estados de una factura que SÍ se puede rectificar (llegó a existir de verdad). */
const RECTIFICABLE_STATUSES: InvoiceStatus[] = ['ISSUED', 'PDF_PENDING', 'IMPORTED']

export const MOTIVO_MIN_LENGTH = 3

/** Subconjunto de la factura original que necesita la lógica pura. */
export interface OriginalLike {
  id: number
  invoice_type: InvoiceType | string
  status: InvoiceStatus | string
  total_amount: string | number
  taxable_base?: string | number | null
  vat_rate?: string | number | null
  vat_amount?: string | number | null
  rectified_by_invoice_id?: number | null
}

function num(v: string | number | null | undefined): number | null {
  if (v == null) return null
  const n = typeof v === 'number' ? v : Number(v)
  return Number.isFinite(n) ? Math.abs(n) : null
}

const round2 = (n: number) => Number(n.toFixed(2))

/**
 * Importes de la rectificativa: rectificación TOTAL por anulación → el negativo
 * exacto de la original (base e IVA negativos incluidos), de modo que las dos
 * filas neteen a CERO en el libro IVA.
 *
 * Se reusa el desglose guardado en la original cuando existe (el neteo tiene
 * que ser exacto, no "recalculado y parecido"); si falta —una VAT legacy
 * IMPORTED sin taxable_base— se deriva con computeAmounts. Invariante que el
 * libro IVA usa para saber a qué régimen pertenece una rectificativa:
 *
 *   RECTIFYING con taxable_base NULL  ⇔  rectifica a una REBU
 */
export function computeRectificativaAmounts(original: OriginalLike): Amounts {
  const total = num(original.total_amount)
  if (total == null) {
    throw new RectificarError(
      'INVALID_AMOUNT',
      `Importe de la factura original inválido: ${original.total_amount}`,
      500
    )
  }

  if (original.invoice_type === 'REBU') {
    return {
      vehicle_sale_price: -total,
      taxable_base: null,
      vat_rate: null,
      vat_amount: null,
      total_amount: -total,
      rebu_margin: null,
      rebu_taxable_base: null,
      rebu_vat_amount: null,
    }
  }

  const derivada = computeAmounts(total, 'VAT')
  const base = num(original.taxable_base) ?? derivada.taxable_base ?? 0
  const cuota = num(original.vat_amount) ?? round2(total - base)
  return {
    vehicle_sale_price: -total,
    taxable_base: -base,
    // vat_rate es un porcentaje, no un importe: NO se niega.
    vat_rate: num(original.vat_rate) ?? derivada.vat_rate,
    vat_amount: -cuota,
    total_amount: -total,
    rebu_margin: null,
    rebu_taxable_base: null,
    rebu_vat_amount: null,
  }
}

/** Lanza RectificarError si la factura no se puede rectificar. */
export function assertRectificable(original: OriginalLike): void {
  if (original.invoice_type === 'RECTIFYING') {
    throw new RectificarError(
      'NOT_RECTIFIABLE',
      'Una factura rectificativa no se puede rectificar.',
      409
    )
  }
  if (original.status === 'RECTIFIED' || original.rectified_by_invoice_id != null) {
    throw new RectificarError(
      'ALREADY_RECTIFIED',
      'Esta factura ya fue rectificada.',
      409,
      { rectificativaId: original.rectified_by_invoice_id ?? null }
    )
  }
  if (!RECTIFICABLE_STATUSES.includes(original.status as InvoiceStatus)) {
    throw new RectificarError(
      'INVALID_STATUS',
      `Una factura en estado ${original.status} no se puede rectificar.`,
      409
    )
  }
}

/** Valida y normaliza el motivo (obligatorio, texto libre). */
export function normalizeMotivo(motivo: unknown): string {
  const m = typeof motivo === 'string' ? motivo.trim() : ''
  if (m.length < MOTIVO_MIN_LENGTH) {
    throw new RectificarError(
      'MOTIVO_REQUERIDO',
      'Es obligatorio indicar el motivo de la rectificación.',
      400
    )
  }
  return m
}

export interface RectificarOptions {
  invoiceId: number
  motivo: string
  userId?: string | null
  userRole?: string | null
  /** Fecha de expedición de la rectificativa (default: hoy). */
  fecha?: Date
}

export interface RectificarResult {
  rectificativa: Invoice
  original: Invoice
}

/**
 * Emite la rectificativa de `invoiceId`. Todo en UNA transacción:
 *   1. FOR UPDATE sobre la original + guardas (ya rectificada / rectificativa /
 *      estado inválido / período cerrado).
 *   2. FOR UPDATE sobre la secuencia RECTIFYING → número FR correlativo.
 *   3. INSERT de la rectificativa (importe negativo, rectifies_invoice_id).
 *   4. La original pasa a RECTIFIED + rectified_by_invoice_id. NO se toca su
 *      número ni su importe → cero huecos de numeración.
 *   5. Cadena Verifactu-lite: 'alta' (FR) + 'anulacion' (original).
 *   6. Expediente de la original → 'anulado'. Deal → vuelve a 'vendido'.
 */
export async function rectificarFactura(
  opts: RectificarOptions
): Promise<RectificarResult> {
  const motivo = normalizeMotivo(opts.motivo)
  const fechaRect = (opts.fecha ?? new Date()).toISOString().slice(0, 10)

  const client = await pool.connect()
  try {
    await client.query('BEGIN')

    const origRes = await client.query<Invoice>(
      `SELECT * FROM invoices WHERE id = $1 FOR UPDATE`,
      [opts.invoiceId]
    )
    const original = origRes.rows[0]
    if (!original) {
      throw new RectificarError('NOT_FOUND', 'Factura no encontrada.', 404)
    }

    assertRectificable(original)
    // Ya rectificada pero sin la marca en la fila (fallo a mitad de camino):
    // el 409 tiene que traer igual el número de la rectificativa existente.
    const yaRect = await client.query<{ id: number; full_invoice_number: string }>(
      `SELECT id, full_invoice_number FROM invoices WHERE rectifies_invoice_id = $1 LIMIT 1`,
      [original.id]
    )
    if (yaRect.rows[0]) {
      throw new RectificarError('ALREADY_RECTIFIED', 'Esta factura ya fue rectificada.', 409, {
        rectificativaId: yaRect.rows[0].id,
        rectificativaNumero: yaRect.rows[0].full_invoice_number,
      })
    }

    // Período contable: ni el mes de la original ni el de la rectificativa
    // pueden estar cerrados (ya entregados a la gestoría).
    await assertPeriodo(client, original.invoice_date, 'No se puede rectificar la factura')
    await assertPeriodo(client, fechaRect, 'No se puede emitir la rectificativa')

    // Serie FR, correlativa. Mismo lock + misma regla de numeración que la
    // emisión normal (gap-filling + burned).
    const seqRes = await client.query<{
      id: number
      series: string
      next_number: number
      number_format: string
      start_number: number | null
    }>(
      `SELECT id, series, next_number, number_format, start_number
         FROM invoice_sequences
        WHERE invoice_type = 'RECTIFYING' AND is_active = TRUE
        ORDER BY year DESC, id DESC
        LIMIT 1
        FOR UPDATE`
    )
    const seq = seqRes.rows[0]
    if (!seq) {
      throw new RectificarError(
        'NO_SEQUENCE',
        'No hay serie de rectificativas activa (aplicá create-serie-rectificativas.sql).',
        500
      )
    }
    const startNumber = seq.start_number ?? seq.next_number
    const number = await resolveNextNumber(client, seq.series, startNumber)
    const fullInvoiceNumber = `${seq.series}-${formatNumber(number, seq.number_format)}`

    const amounts = computeRectificativaAmounts(original)

    const insRes = await client.query<Invoice>(
      `INSERT INTO invoices (
         deal_id, vehiculo_id, b2b_venta_id,
         invoice_type, series, number, full_invoice_number,
         invoice_date, operation_date,
         buyer_name, buyer_nif_cif, buyer_email, buyer_address,
         vehicle_make, vehicle_model, vehicle_plate, vehicle_vin, vehicle_kms, vehicle_year,
         vehicle_sale_price, taxable_base, vat_rate, vat_amount, total_amount,
         rebu_margin, rebu_taxable_base, rebu_vat_amount,
         status, notes, rectifies_invoice_id, rectification_reason, created_by_user_id
       )
       SELECT
         o.deal_id, o.vehiculo_id, o.b2b_venta_id,
         'RECTIFYING', $2, $3, $4,
         $5, o.operation_date,
         o.buyer_name, o.buyer_nif_cif, o.buyer_email, o.buyer_address,
         o.vehicle_make, o.vehicle_model, o.vehicle_plate, o.vehicle_vin, o.vehicle_kms, o.vehicle_year,
         $6, $7, $8, $9, $10,
         $11, $12, $13,
         'PDF_PENDING', $14, o.id, $15, $16
       FROM invoices o
       WHERE o.id = $1
       RETURNING *`,
      [
        original.id,
        seq.series,
        number,
        fullInvoiceNumber,
        fechaRect,
        amounts.vehicle_sale_price,
        amounts.taxable_base,
        amounts.vat_rate,
        amounts.vat_amount,
        amounts.total_amount,
        amounts.rebu_margin,
        amounts.rebu_taxable_base,
        amounts.rebu_vat_amount,
        `Factura rectificativa por anulación de ${original.full_invoice_number}. Motivo: ${motivo}`,
        motivo,
        opts.userId ?? null,
      ]
    )
    const rectificativa = insRes.rows[0]

    // High-water mark de la secuencia (nunca regresa; GREATEST como en la
    // emisión normal).
    await client.query(
      `UPDATE invoice_sequences
          SET next_number = GREATEST(next_number, $1), updated_at = NOW()
        WHERE id = $2`,
      [number + 1, seq.id]
    )

    // La original conserva número e importe; sólo cambia de estado.
    const updRes = await client.query<Invoice>(
      `UPDATE invoices
          SET status = 'RECTIFIED',
              rectified_by_invoice_id = $1,
              updated_at = NOW()
        WHERE id = $2
        RETURNING *`,
      [rectificativa.id, original.id]
    )

    await client.query(
      `INSERT INTO invoice_audit_logs (invoice_id, action, new_values_json, reason, user_id, user_role)
       VALUES ($1, 'CREATED', $2, $3, $4, $5)`,
      [
        rectificativa.id,
        JSON.stringify({
          full_invoice_number: rectificativa.full_invoice_number,
          invoice_type: 'RECTIFYING',
          total_amount: rectificativa.total_amount,
          rectifies: original.full_invoice_number,
        }),
        motivo,
        opts.userId ?? null,
        opts.userRole ?? null,
      ]
    )
    await client.query(
      `INSERT INTO invoice_audit_logs (invoice_id, action, old_values_json, new_values_json, reason, user_id, user_role)
       VALUES ($1, 'STATUS_CHANGED', $2, $3, $4, $5, $6)`,
      [
        original.id,
        JSON.stringify({ status: original.status }),
        JSON.stringify({
          status: 'RECTIFIED',
          rectified_by: rectificativa.full_invoice_number,
        }),
        motivo,
        opts.userId ?? null,
        opts.userRole ?? null,
      ]
    )

    // Cadena de integridad: la rectificativa es un alta (es una factura nueva)
    // y la original queda anulada. Dos eslabones, misma transacción.
    await appendRegistro(client, {
      tipoRegistro: 'alta',
      invoiceId: rectificativa.id,
      numeroSerie: rectificativa.full_invoice_number,
      fechaExpedicion: fechaRect,
      importeTotal: amounts.total_amount,
      metadata: {
        origen: 'rectificativa',
        rectifica: original.full_invoice_number,
        motivo,
      },
    })
    await appendRegistro(client, {
      tipoRegistro: 'anulacion',
      invoiceId: original.id,
      numeroSerie: original.full_invoice_number,
      fechaExpedicion: original.invoice_date,
      importeTotal: original.total_amount,
      metadata: {
        origen: 'rectificativa',
        rectificada_por: rectificativa.full_invoice_number,
        motivo,
      },
    })

    // El expediente de la original deja de ser un pendiente del trimestre.
    const expReg = await client.query<{ reg: string | null }>(
      `SELECT to_regclass('public.expedientes')::text AS reg`
    )
    if (expReg.rows[0]?.reg) {
      await client.query(
        `UPDATE expedientes
            SET estado = 'anulado', updated_at = NOW()
          WHERE numero_factura = $1`,
        [original.full_invoice_number]
      )
    }

    // El Deal vuelve a 'vendido' para poder re-facturarse correctamente (misma
    // guarda que /anular y DELETE: sólo si el campo sigue apuntando a ESTA
    // factura). El índice idx_invoices_unique_per_sale ignora las RECTIFIED,
    // así que la re-emisión no choca.
    if (original.deal_id) {
      await client.query(
        `UPDATE "Deal"
            SET estado = CASE WHEN estado = 'facturado' THEN 'vendido' ELSE estado END,
                "fechaFacturada" = CASE WHEN factura = $1 THEN NULL ELSE "fechaFacturada" END,
                factura = CASE WHEN factura = $1 THEN NULL ELSE factura END
          WHERE id = $2`,
        [original.full_invoice_number, original.deal_id]
      )
    }

    await client.query('COMMIT')
    return { rectificativa, original: updRes.rows[0] ?? original }
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {})
    throw err
  } finally {
    client.release()
  }
}

async function assertPeriodo(
  client: PoolClient,
  fecha: string | Date,
  contexto: string
): Promise<void> {
  try {
    await assertPeriodoAbierto(client, fecha, contexto)
  } catch (err) {
    if (err instanceof PeriodoCerradoError) {
      throw new RectificarError('PERIODO_CERRADO', err.message, 409, {
        anio: err.anio,
        mes: err.mes,
      })
    }
    throw err
  }
}

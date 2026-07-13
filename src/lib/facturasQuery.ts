/**
 * Query compartida de facturas emitidas (para los endpoints de monitoreo/reparación).
 *
 * Centraliza el WHERE correcto en un solo lugar para no volver a equivocarlo:
 *  - `status` real es 'ISSUED' (emitida por la app) o 'IMPORTED' (migrada/LEGACY);
 *    NO existe 'ACTIVE'. Ambas cuentan como facturas reales que deben estar en CB.
 *  - `invoice_date` se castea a texto (YYYY-MM-DD) en SQL: pg devuelve DATE como
 *    objeto Date y el resto del código hace .slice() sobre string.
 */

import { pool } from '@/lib/direct-database'
import { EMITTED_STATUSES, monthRange } from '@/lib/facturasMonitor'

export { EMITTED_STATUSES, monthRange }

export interface EmittedInvoice {
  id: number
  full_invoice_number: string
  invoice_date: string // YYYY-MM-DD (casteado en SQL)
  invoice_type: string
  total_amount: number
  /** null cuando la factura no tiene Deal asociado (p.ej. B2B, o huérfana). */
  deal_id: number | null
  deal_number: string | null
  referencia: string | null
  matricula: string | null
}

/**
 * Facturas emitidas de un año (o de un mes concreto 1..12 si se pasa `month`).
 *
 * LEFT JOIN (no INNER): una factura sin deal_id (B2B, o retail huérfana) debe
 * seguir apareciendo acá — con INNER JOIN quedaban invisibles a todos los
 * checks de monitoreo (p.ej. R-2026-026, venta B2B sin Deal). COALESCE cae a
 * la matrícula guardada en la propia factura cuando el join no matchea.
 */
export async function getEmittedInvoices(year: number, month?: number): Promise<EmittedInvoice[]> {
  const { from, to } = monthRange(year, month)

  const res = await pool.query<EmittedInvoice>(
    `SELECT i.id, i.full_invoice_number, i.invoice_date::text AS invoice_date,
            i.invoice_type, i.total_amount, i.deal_id,
            d.numero AS deal_number, v.referencia,
            COALESCE(v.matricula, i.vehicle_plate) AS matricula
       FROM invoices i
       LEFT JOIN "Deal" d ON d.id = i.deal_id
       LEFT JOIN "Vehiculo" v ON v.id = d."vehiculoId"
      WHERE i.invoice_date >= $1 AND i.invoice_date < $2
        AND i.status = ANY($3)
        AND i.invoice_type <> 'RECTIFYING'
      ORDER BY i.invoice_date`,
    [from, to, EMITTED_STATUSES as unknown as string[]]
  )
  return res.rows
}

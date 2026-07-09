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
  deal_id: number
  deal_number: string
  referencia: string | null
  matricula: string | null
}

/** Facturas emitidas de un año (o de un mes concreto 1..12 si se pasa `month`). */
export async function getEmittedInvoices(year: number, month?: number): Promise<EmittedInvoice[]> {
  const { from, to } = monthRange(year, month)

  const res = await pool.query<EmittedInvoice>(
    `SELECT i.id, i.full_invoice_number, i.invoice_date::text AS invoice_date,
            i.invoice_type, i.total_amount, i.deal_id,
            d.numero AS deal_number, v.referencia, v.matricula
       FROM invoices i
       JOIN "Deal" d ON d.id = i.deal_id
       JOIN "Vehiculo" v ON v.id = d."vehiculoId"
      WHERE i.invoice_date >= $1 AND i.invoice_date < $2
        AND i.status = ANY($3)
      ORDER BY i.invoice_date`,
    [from, to, EMITTED_STATUSES as unknown as string[]]
  )
  return res.rows
}

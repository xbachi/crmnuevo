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
  deal_id: number | null
  b2b_venta_id: number | null
  vehiculo_id: number | null
  deal_number: string | null
  origin: 'retail' | 'b2b' | 'orphan' | 'invalid'
  referencia: string | null
  matricula: string | null
}

/** Facturas emitidas de un año (o de un mes concreto 1..12 si se pasa `month`). */
export async function getEmittedInvoices(
  year: number,
  month?: number
): Promise<EmittedInvoice[]> {
  const { from, to } = monthRange(year, month)

  const res = await pool.query<EmittedInvoice>(
    `SELECT i.id, i.full_invoice_number, i.invoice_date::text AS invoice_date,
            i.invoice_type, i.total_amount, i.deal_id, i.b2b_venta_id,
            COALESCE(i.vehiculo_id, d."vehiculoId", vb.vehiculo_id) AS vehiculo_id,
            COALESCE(d.numero, vb.numero) AS deal_number,
            CASE
              WHEN i.deal_id IS NOT NULL AND i.b2b_venta_id IS NOT NULL THEN 'invalid'
              WHEN i.deal_id IS NOT NULL THEN 'retail'
              WHEN i.b2b_venta_id IS NOT NULL THEN 'b2b'
              ELSE 'orphan'
            END AS origin,
            v.referencia, v.matricula
       FROM invoices i
       LEFT JOIN "Deal" d ON d.id = i.deal_id
       LEFT JOIN venta_b2b vb ON vb.id = i.b2b_venta_id
       LEFT JOIN "Vehiculo" v
         ON v.id = COALESCE(i.vehiculo_id, d."vehiculoId", vb.vehiculo_id)
      WHERE i.invoice_date >= $1 AND i.invoice_date < $2
        AND i.status = ANY($3)
      ORDER BY i.invoice_date`,
    [from, to, EMITTED_STATUSES as unknown as string[]]
  )
  return res.rows
}

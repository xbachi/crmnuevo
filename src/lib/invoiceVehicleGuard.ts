import type { PoolClient } from 'pg'
import type { Invoice } from '@/lib/invoiceRepository'

const VEHICLE_INVOICE_LOCK_NAMESPACE = 20_260_711

export async function lockAndFindActiveVehicleInvoice(
  client: PoolClient,
  vehiculoId: number
): Promise<Invoice | null> {
  await client.query('SELECT pg_advisory_xact_lock($1, $2)', [
    VEHICLE_INVOICE_LOCK_NAMESPACE,
    vehiculoId,
  ])

  const result = await client.query<Invoice>(
    `SELECT * FROM invoices
      WHERE vehiculo_id = $1
        AND invoice_type IN ('VAT', 'REBU')
        AND status NOT IN ('VOIDED', 'RECTIFIED')
      ORDER BY id DESC
      LIMIT 1`,
    [vehiculoId]
  )
  return result.rows[0] ?? null
}

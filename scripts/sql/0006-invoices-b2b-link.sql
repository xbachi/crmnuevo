-- 0006-invoices-b2b-link.sql
-- Permite que una factura del módulo de facturación esté ligada a una venta B2B
-- en lugar de a un Deal retail. Comparten la misma tabla `invoices` y la
-- misma secuencia fiscal (REBU/IVA) — solo cambia el origen de los datos.

BEGIN;

ALTER TABLE invoices
  ADD COLUMN IF NOT EXISTS b2b_venta_id INTEGER REFERENCES venta_b2b(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_invoices_b2b_venta_id ON invoices(b2b_venta_id);

-- Una venta B2B solo puede tener una factura activa (idempotente).
CREATE UNIQUE INDEX IF NOT EXISTS idx_invoices_unique_per_b2b_venta
  ON invoices(b2b_venta_id)
  WHERE b2b_venta_id IS NOT NULL AND status <> 'VOIDED';

COMMIT;

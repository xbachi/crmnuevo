-- Amplía costobeneficio_logs para auditar reconciliaciones a nivel CELDA
-- (resync admin y auto-expense), no sólo emisiones de factura.
--
-- Aditiva e idempotente: ADD COLUMN IF NOT EXISTS + DROP NOT NULL. No borra,
-- renombra ni estrecha tipos de columnas existentes, ni toca filas existentes.
--
-- Contexto de las NOT NULL que se relajan: la tabla original
-- (add-costobeneficio-logs.sql) exige deal_id/invoice_number/invoice_date/
-- invoice_type/sale_price NOT NULL porque cada fila era una emisión completa.
-- Los nuevos logs de celda (source='admin-resync' / 'auto-expense') no tienen
-- todos esos campos (p.ej. el resync de gasto sólo conoce vehiculo_id), así que
-- deben poder quedar NULL. success/action/detail siguen NOT NULL: siempre se setean.

ALTER TABLE costobeneficio_logs
  ADD COLUMN IF NOT EXISTS source TEXT,
  ADD COLUMN IF NOT EXISTS cell_ref TEXT,
  ADD COLUMN IF NOT EXISTS previous_value TEXT,
  ADD COLUMN IF NOT EXISTS new_value TEXT,
  ADD COLUMN IF NOT EXISTS vehiculo_id INTEGER,
  ADD COLUMN IF NOT EXISTS dry_run BOOLEAN;

ALTER TABLE costobeneficio_logs
  ALTER COLUMN deal_id DROP NOT NULL,
  ALTER COLUMN invoice_number DROP NOT NULL,
  ALTER COLUMN invoice_date DROP NOT NULL,
  ALTER COLUMN invoice_type DROP NOT NULL,
  ALTER COLUMN sale_price DROP NOT NULL;

-- Log por celda de lo que el CRM escribe en las hojas COMPRAS / Ventas-Sevencars
-- (src/lib/sheetsVehiculo.ts). Idempotente.
CREATE TABLE IF NOT EXISTS sheets_sync_log (
  id             SERIAL PRIMARY KEY,
  vehiculo_id    INTEGER REFERENCES "Vehiculo"(id) ON DELETE SET NULL,
  hoja           TEXT NOT NULL,      -- 'VENTAS' | 'COMPRAS'
  pestana        TEXT NOT NULL,      -- 'Expo' | 'Deposito' | 'R' | 'Compras'
  celda          TEXT NOT NULL,      -- A1, p.ej. 'Q23'
  columna        TEXT NOT NULL,      -- cabecera verbatim ('' si la columna no tiene)
  valor_anterior TEXT,
  valor_nuevo    TEXT,
  motivo         TEXT NOT NULL,      -- create | update | estado | deal | kanban | deposito | cron | retry | admin
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_sheets_sync_log_vehiculo ON sheets_sync_log(vehiculo_id);
CREATE INDEX IF NOT EXISTS idx_sheets_sync_log_created ON sheets_sync_log(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_webhook_outbox_tipo_estado ON webhook_outbox(tipo, estado);

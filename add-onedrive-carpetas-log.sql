-- Traza de cada operación sobre carpetas de coche en OneDrive (src/lib/onedriveCarpetas.ts). Idempotente.
CREATE TABLE IF NOT EXISTS onedrive_carpetas_log (
  id          SERIAL PRIMARY KEY,
  vehiculo_id INTEGER REFERENCES "Vehiculo"(id) ON DELETE SET NULL,
  accion      TEXT NOT NULL,        -- crear | vendido | renombrar
  payload     JSONB,                -- body enviado al receptor
  resultado   JSONB,                -- respuesta del receptor
  ok          BOOLEAN NOT NULL DEFAULT FALSE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_onedrive_carpetas_log_vehiculo ON onedrive_carpetas_log(vehiculo_id);
CREATE INDEX IF NOT EXISTS idx_onedrive_carpetas_log_created ON onedrive_carpetas_log(created_at DESC);

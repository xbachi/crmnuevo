-- Columnas *_at de las acciones de cambio de nombre en Deal (las lee y escribe
-- src/lib/direct-database.ts). add-action-timestamps.sql las creó en producción
-- pero su bloque UPDATE referencia columnas snake_case que Deal no tiene, así
-- que no puede aplicarse a una base vacía. Idempotente: en producción es no-op.
ALTER TABLE "Deal"
  ADD COLUMN IF NOT EXISTS cambio_nombre_solicitado_at TIMESTAMP,
  ADD COLUMN IF NOT EXISTS documentacion_recibida_at   TIMESTAMP,
  ADD COLUMN IF NOT EXISTS documentacion_retirada_at   TIMESTAMP,
  ADD COLUMN IF NOT EXISTS cliente_avisado_at          TIMESTAMP;

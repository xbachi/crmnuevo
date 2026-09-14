-- "Vehiculo".recibido ya existía como BOOLEAN (estado de compra); el
-- ADD COLUMN recibido TEXT de add-vehiculo-compra-logistica.sql fue no-op.
-- El texto libre de la columna RECIBIDO de COMPRAS va aquí. Idempotente.
ALTER TABLE "Vehiculo"
  ADD COLUMN IF NOT EXISTS "recibidoTexto" TEXT;

-- Datos de compra/logística que hoy sólo viven en COMPRAS/Compras (texto
-- libre tal como en la hoja; recibidoFecha es la interpretación de recibido).
-- Idempotente.
ALTER TABLE "Vehiculo"
  ADD COLUMN IF NOT EXISTS proveedor TEXT,
  ADD COLUMN IF NOT EXISTS abonado TEXT,
  ADD COLUMN IF NOT EXISTS comprobante TEXT,
  ADD COLUMN IF NOT EXISTS "porteSolicitado" TEXT,
  ADD COLUMN IF NOT EXISTS recibido TEXT,
  ADD COLUMN IF NOT EXISTS "recibidoFecha" DATE;

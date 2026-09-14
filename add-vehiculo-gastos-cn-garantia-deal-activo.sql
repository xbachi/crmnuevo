-- Columnas que el código ya lee/escribe pero ninguna migración creaba:
-- gastosCNGarantia (direct-database.ts, vehiculoEstado.ts) y dealActivoId
-- (vehiculoVenta.ts, docs/schema.prisma). Idempotente.
ALTER TABLE "Vehiculo"
  ADD COLUMN IF NOT EXISTS "gastosCNGarantia" DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS "dealActivoId" INTEGER;

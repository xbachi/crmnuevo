-- Fechas reales de vencimiento en el vehículo (ITV, seguro, garantía).
-- Los strings libres itv/seguro se mantienen como fallback; la fecha manda
-- cuando está informada. Idempotente.
ALTER TABLE "Vehiculo"
  ADD COLUMN IF NOT EXISTS "itvVence" DATE,
  ADD COLUMN IF NOT EXISTS "seguroVence" DATE,
  ADD COLUMN IF NOT EXISTS "garantiaVence" DATE;

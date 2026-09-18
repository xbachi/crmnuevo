-- Columnas de Deal que usa /api/deals/[id]/venta-info (condiciones de la
-- venta: garantía y desglose contado/financiado). En producción existen pero
-- no había migración; sin ellas una base vacía devuelve 500. Idempotente.
ALTER TABLE "Deal"
  ADD COLUMN IF NOT EXISTS garantia          TEXT,
  ADD COLUMN IF NOT EXISTS "montoContado"    DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS "montoFinanciado" DOUBLE PRECISION;

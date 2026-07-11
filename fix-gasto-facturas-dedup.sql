-- Dedup real de gasto_facturas (auditoría C-03).
-- Problema: UNIQUE (tipo, numero_factura) no deduplica porque numero_factura
-- guarda el NOMBRE DEL ARCHIVO PDF, no el nº real de factura → la misma factura
-- archivada con dos nombres (_2, renombres) se cargó dos veces (14 pares, ~1.899,50 €).
-- numero_canonico = nº real extraído del filename (src/lib/facturaNumero.ts);
-- NULL cuando el extractor no está seguro (un NULL no colisiona).
-- Backfill: scripts/backfill-numero-canonico.js (--dry-run por defecto).
-- Idempotente.

ALTER TABLE gasto_facturas ADD COLUMN IF NOT EXISTS numero_canonico TEXT;

CREATE INDEX IF NOT EXISTS idx_gasto_facturas_canonico
  ON gasto_facturas (tipo, numero_canonico, vehiculo_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- PASO POSTERIOR (NO ejecutar todavía):
-- El índice UNIQUE parcial de abajo es la garantía definitiva contra duplicados,
-- pero HOY fallaría al crearse: los 14 pares duplicados existentes violan la
-- unicidad. Orden correcto:
--   1) aplicar este archivo (columna + índice normal),
--   2) correr scripts/backfill-numero-canonico.js --apply,
--   3) revisar los grupos count>1 que imprime y BORRAR a mano la fila duplicada
--      de cada par (dejando una),
--   4) recién entonces ejecutar:
--
-- CREATE UNIQUE INDEX IF NOT EXISTS uq_gasto_facturas_canonico
--   ON gasto_facturas (tipo, numero_canonico, vehiculo_id)
--   WHERE numero_canonico IS NOT NULL;
-- ─────────────────────────────────────────────────────────────────────────────

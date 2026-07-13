-- =============================================================================
-- create-serie-rectificativas.sql — Facturas rectificativas (anulación formal)
--
-- Regla dura del negocio: una factura emitida NO se borra. La numeración es
-- correlativa y un hueco es un problema fiscal. Una factura mal emitida se
-- ANULA emitiendo una RECTIFICATIVA que la referencia, con importe negativo
-- (rectificación total por anulación). La original conserva su número y su
-- importe; sólo cambia de estado a 'RECTIFIED'.
--
-- Serie propia: FR-2026 (la letra R ya está tomada por REBU).
--
-- Efecto contable buscado:
--   · Libro IVA / manifiesto → aparecen LAS DOS (original + rectificativa):
--     +12.100 y -12.100 → netean a cero. Es lo que la gestora necesita ver.
--   · Conteos operativos (comisiones, chequeo de expedientes) → NO cuentan ni
--     la original RECTIFIED ni la RECTIFYING. Una venta duplicada no es venta.
--
-- ADITIVA e IDEMPOTENTE. NO se aplica automáticamente.
-- =============================================================================

BEGIN;

-- A) Serie de rectificativas ---------------------------------------------------
-- 'RECTIFYING' ya está permitido por invoice_sequences_type_check (0001).

INSERT INTO invoice_sequences (invoice_type, series, year, next_number, number_format, is_active)
VALUES ('RECTIFYING', 'FR-2026', 2026, 1, '%03d', TRUE)
ON CONFLICT (invoice_type, series) DO NOTHING;

UPDATE invoice_sequences
   SET start_number = 1
 WHERE series = 'FR-2026' AND start_number IS NULL;

-- B) Enlace original <-> rectificativa ----------------------------------------

ALTER TABLE invoices
  ADD COLUMN IF NOT EXISTS rectifies_invoice_id     INTEGER REFERENCES invoices(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS rectified_by_invoice_id  INTEGER REFERENCES invoices(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS rectification_reason     TEXT;

CREATE INDEX IF NOT EXISTS idx_invoices_rectifies
  ON invoices(rectifies_invoice_id) WHERE rectifies_invoice_id IS NOT NULL;

-- Una factura se rectifica UNA sola vez: el segundo intento choca acá aunque
-- la app fallara en detectarlo (la ruta ya devuelve 409 ALREADY_RECTIFIED).
CREATE UNIQUE INDEX IF NOT EXISTS ux_invoices_unique_rectifies
  ON invoices(rectifies_invoice_id) WHERE rectifies_invoice_id IS NOT NULL;

-- C) Importe negativo SOLO en rectificativas -----------------------------------
-- invoices_total_positive (0001) prohíbe total_amount < 0 en toda la tabla.
-- Se sustituye por un CHECK con signo dependiente del tipo.

ALTER TABLE invoices DROP CONSTRAINT IF EXISTS invoices_total_positive;
ALTER TABLE invoices DROP CONSTRAINT IF EXISTS invoices_total_sign;
ALTER TABLE invoices ADD CONSTRAINT invoices_total_sign CHECK (
  CASE WHEN invoice_type = 'RECTIFYING' THEN total_amount <= 0 ELSE total_amount >= 0 END
);

-- D) Una factura RECTIFIED deja libre el hueco (deal, tipo) --------------------
-- La original rectificada ya no es la factura activa de esa venta: el Deal
-- vuelve a 'vendido' y puede re-facturarse correctamente. Sin esto, el índice
-- único seguiría bloqueando la re-emisión (status RECTIFIED <> 'VOIDED').
-- El número de la original NO se libera (sigue ocupado en invoices).

DROP INDEX IF EXISTS idx_invoices_unique_per_sale;
CREATE UNIQUE INDEX IF NOT EXISTS idx_invoices_unique_per_sale
  ON invoices(deal_id, invoice_type)
  WHERE deal_id IS NOT NULL AND status NOT IN ('VOIDED', 'RECTIFIED');

DROP INDEX IF EXISTS idx_invoices_unique_per_b2b_venta;
CREATE UNIQUE INDEX IF NOT EXISTS idx_invoices_unique_per_b2b_venta
  ON invoices(b2b_venta_id)
  WHERE b2b_venta_id IS NOT NULL AND status NOT IN ('VOIDED', 'RECTIFIED');

-- E) Expediente de una factura rectificada → 'anulado' -------------------------
-- Deja de contar como expediente incompleto/faltante en el pre-cierre.

DO $$
BEGIN
  IF to_regclass('public.expedientes') IS NOT NULL THEN
    ALTER TABLE expedientes DROP CONSTRAINT IF EXISTS expedientes_estado_check;
    ALTER TABLE expedientes ADD CONSTRAINT expedientes_estado_check
      CHECK (estado IN ('incompleto', 'completo', 'enviado', 'confirmado', 'anulado'));
  END IF;
END $$;

COMMIT;

-- Verificación:
--   SELECT invoice_type, series, next_number, start_number, is_active
--     FROM invoice_sequences ORDER BY invoice_type;
--   -- espera una fila RECTIFYING / FR-2026 / 1 / 1 / true

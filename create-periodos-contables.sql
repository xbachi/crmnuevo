-- Cierre mensual contable (period locking).
-- Una fila por (anio, mes). estado='cerrado' bloquea: emisión de facturas con
-- invoice_date en ese mes, registro de documentos en facturas_registro con
-- fecha_factura en ese mes, y carga de gastos mientras el mes ACTUAL esté cerrado.
-- snapshot guarda los totales del mes al momento del cierre (evidencia de lo entregado).
-- Idempotente. NO se aplica automáticamente: correr a mano en Supabase.

CREATE TABLE IF NOT EXISTS periodos_contables (
  id SERIAL PRIMARY KEY,
  anio INT NOT NULL,
  mes INT NOT NULL CHECK (mes BETWEEN 1 AND 12),
  estado TEXT NOT NULL DEFAULT 'abierto' CHECK (estado IN ('abierto', 'cerrado')),
  snapshot JSONB,
  cerrado_at TIMESTAMPTZ,
  cerrado_por TEXT,
  reabierto_at TIMESTAMPTZ,
  reabierto_por TEXT,
  motivo_reapertura TEXT,
  UNIQUE (anio, mes)
);

COMMENT ON TABLE periodos_contables IS
  'Cierre mensual: un mes cerrado rechaza emisión/registro de facturas con fecha en ese mes (guards en app, no en DB).';
COMMENT ON COLUMN periodos_contables.snapshot IS
  'Totales del mes al cerrar: facturas emitidas (nº + suma), facturas_registro por categoría (nº + suma), gastos (nº + suma).';

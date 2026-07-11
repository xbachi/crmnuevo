-- Libro de facturas de proveedor aplicadas a cada vehículo.
-- Permite idempotencia (no duplicar el mismo nº de factura) y sumar varias
-- facturas del mismo tipo. Vehiculo.gastos* = SUM(importe) por (vehiculo, tipo).
CREATE TABLE IF NOT EXISTS gasto_facturas (
  id             SERIAL PRIMARY KEY,
  vehiculo_id    INTEGER NOT NULL,
  matricula      TEXT,
  tipo           TEXT NOT NULL,          -- 'mecauto'|'fergo'|'world'|'compra'|'transporte'|'itv'
  numero_factura TEXT NOT NULL,
  importe        NUMERIC(12,2) NOT NULL, -- total con IVA (como figura en la planilla)
  proveedor      TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_gasto_facturas_vehiculo ON gasto_facturas(vehiculo_id);
CREATE INDEX IF NOT EXISTS idx_gasto_facturas_matricula ON gasto_facturas(matricula);
CREATE UNIQUE INDEX IF NOT EXISTS uq_gasto_facturas_proveedor_numero
  ON gasto_facturas (
    LOWER(BTRIM(COALESCE(NULLIF(proveedor, ''), tipo))),
    UPPER(REGEXP_REPLACE(BTRIM(numero_factura), '\\s+', '', 'g'))
  );

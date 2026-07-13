-- create-venta-condiciones-pago.sql
-- Condiciones de pago capturadas al generar el contrato de venta de un deal.
-- Fuente de datos para la página /comisiones. Idempotente; aplicar a mano.

CREATE TABLE IF NOT EXISTS venta_condiciones_pago (
  id SERIAL PRIMARY KEY,
  deal_id INT NOT NULL UNIQUE,
  forma_pago TEXT NOT NULL CHECK (forma_pago IN ('contado', 'financiado', 'mixto')),
  banco TEXT,
  interes NUMERIC(5, 2) CHECK (interes IS NULL OR interes >= 0),
  cuotas INT CHECK (cuotas IS NULL OR cuotas >= 1),
  monto_financiado NUMERIC(12, 2) CHECK (monto_financiado IS NULL OR monto_financiado > 0),
  monto_contado NUMERIC(12, 2) CHECK (monto_contado IS NULL OR monto_contado > 0),
  garantia_premium BOOLEAN NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- Coherencia: financiado y mixto exigen los datos de la financiación.
  CONSTRAINT vcp_financiacion_completa CHECK (
    forma_pago = 'contado'
    OR (banco IS NOT NULL AND cuotas IS NOT NULL AND monto_financiado IS NOT NULL)
  ),
  -- Coherencia: mixto exige la parte al contado.
  CONSTRAINT vcp_mixto_con_contado CHECK (
    forma_pago <> 'mixto' OR monto_contado IS NOT NULL
  )
);

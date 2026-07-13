-- create-comision-config.sql
-- Configuración (fila única id=1) de la tabla de comisiones de la vendedora.
-- Seed = tabla real vigente. Los porcentajes van como número HUMANO
-- (pctPremium 1 = 1% del importe financiado, NO 100%); umbralFinanciado sí es
-- una fracción (0.70 = 70%). Idempotente; aplicar a mano.

CREATE TABLE IF NOT EXISTS comision_config (
  id SERIAL PRIMARY KEY,
  config JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by TEXT
);

INSERT INTO comision_config (id, config)
VALUES (
  1,
  '{
    "umbralFinanciado": 0.70,
    "contado":        { "standard": 25, "premium": 40 },
    "financiadoBajo": { "standard": 20, "premium": 50 },
    "financiadoAlto": { "pctStandard": 0.4, "pctPremium": 1.0 },
    "bonos": [
      { "minVentas": 4,  "importe": 50 },
      { "minVentas": 6,  "importe": 100 },
      { "minVentas": 8,  "importe": 200 },
      { "minVentas": 10, "importe": 250 },
      { "minVentas": 12, "importe": 300 },
      { "minVentas": 14, "importe": 400 },
      { "minVentas": 16, "importe": 500 }
    ]
  }'::jsonb
)
ON CONFLICT (id) DO NOTHING;

-- create-comision-config.sql
-- Configuración (fila única id=1) de la tabla de comisiones de la vendedora.
-- Todos los importes arrancan en 0 → la UI muestra "pendiente de configurar".
-- Idempotente; aplicar a mano.

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
    "base": {
      "contado":    { "conGarantiaPremium": 0, "sinGarantiaPremium": 0 },
      "financiado": { "conGarantiaPremium": 0, "sinGarantiaPremium": 0 },
      "mixto":      { "conGarantiaPremium": 0, "sinGarantiaPremium": 0 }
    },
    "pctMontoFinanciado": 0
  }'::jsonb
)
ON CONFLICT (id) DO NOTHING;

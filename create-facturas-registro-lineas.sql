-- Desglose por tipo de IVA de cada factura registrada.
-- Una factura con 21% + exenta + suplido no cabe en un solo importe: el 303
-- necesita base y cuota SEPARADAS por tipo. Cabecera (base_total/cuota_iva_total)
-- queda denormalizada = Σ de estas líneas.
--
-- INVARIANTE (Σ líneas = importe ±0,02; cuota ≈ base×tipo/100 ±0,02) se valida
-- EN LA APP, no en la DB — es el patrón del repo (ver periodos_contables: los
-- guards de cierre viven en la app). Un CHECK cross-fila no es viable en
-- PostgreSQL sin trigger, y los redondeos de cada proveedor obligan a tolerancia:
-- un CHECK exacto rechazaría facturas reales y correctas.
--
-- ORDEN: aplicar add-facturas-registro-fiscal.sql ANTES.
-- Idempotente. NO se aplica automáticamente: correr a mano en Supabase.

CREATE TABLE IF NOT EXISTS facturas_registro_lineas (
  id             SERIAL PRIMARY KEY,
  registro_id    INT NOT NULL REFERENCES facturas_registro(id) ON DELETE CASCADE,
  orden          INT NOT NULL DEFAULT 1,
  tipo_linea     TEXT NOT NULL DEFAULT 'iva'
                   CHECK (tipo_linea IN ('iva','exenta','isp','suplido','retencion','rebu')),
  tipo_iva       NUMERIC(5,2),                    -- 21|10|4|0; NULL en suplido/retencion
  base           NUMERIC(12,2) NOT NULL,
  cuota          NUMERIC(12,2) NOT NULL DEFAULT 0,
  retencion_pct  NUMERIC(5,2),                    -- IRPF profesionales/alquiler
  concepto       TEXT,
  deducible      TEXT CHECK (deducible IN ('si','no','parcial')),  -- NULL hereda la cabecera
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (registro_id, orden)
);

CREATE INDEX IF NOT EXISTS ix_frl_registro ON facturas_registro_lineas (registro_id);

COMMENT ON TABLE facturas_registro_lineas IS
  'Desglose por tipo de IVA. Σ líneas = facturas_registro.importe ±0,02 (validado en la app, no en DB).';
COMMENT ON COLUMN facturas_registro_lineas.deducible IS
  'NULL = hereda facturas_registro.deducible. Se rellena sólo cuando una línea difiere de la cabecera.';

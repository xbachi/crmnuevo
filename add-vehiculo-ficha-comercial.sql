-- Ficha comercial (web y presupuesto) del vehículo; refleja la hoja
-- Base_Datos_Vehiculos_2025/Datos. Sin precio_contado: el precio de venta al
-- público ya vive en "Vehiculo"."precioPublicacion" (lo leen stock público,
-- deals, contratos...); la API expone precio_contado como alias de esa columna
-- para no tener dos fuentes. Idempotente.
CREATE TABLE IF NOT EXISTS vehiculo_ficha_comercial (
  vehiculo_id            INTEGER PRIMARY KEY REFERENCES "Vehiculo"(id) ON DELETE CASCADE,
  regimen                TEXT CHECK (regimen IN ('IVA21', 'REBU')),
  nombre_comercial       TEXT,
  url_imagen             TEXT,
  url_qr                 TEXT,
  mantenimientos         TEXT,
  tarifa_financiacion    TEXT CHECK (tarifa_financiacion IN ('NORMAL', 'ESPECIAL', 'SIN_DTO', 'CONSULTAR')),
  garantia               BOOLEAN,
  gp                     NUMERIC(10,2),
  pct_dto                NUMERIC(5,4),
  meses_garantia_fabrica INTEGER,
  motor_cv               INTEGER,
  cubicaje               INTEGER,
  caja                   TEXT,
  combustible            TEXT,
  created_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at             TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

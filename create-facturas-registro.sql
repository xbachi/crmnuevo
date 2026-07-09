-- Registro unificado de facturas (fuente de verdad CRM-first).
-- Toda factura que entra al sistema (gestoría recurrente + por-coche
-- servicio/compra) se registra acá. Dedup garantizado por la DB:
--   · hash_contenido UNIQUE  → nunca dos veces el mismo PDF (re-archivo exacto)
--   · (proveedor, numero_factura) UNIQUE (cuando hay número) → re-generados
-- El registro decide ruteo (mes por fecha / carpeta del coche por matrícula).

CREATE TABLE IF NOT EXISTS facturas_registro (
  id              SERIAL PRIMARY KEY,
  proveedor       TEXT NOT NULL,
  categoria       TEXT NOT NULL,            -- 'gestoria' | 'coche-servicio' | 'coche-compra'
  numero_factura  TEXT,                     -- extraído del contenido (puede faltar)
  hash_contenido  TEXT NOT NULL,            -- md5 de los bytes del PDF (dedup exacto)
  importe         NUMERIC(12,2),
  fecha_factura   DATE,
  anio            INTEGER,
  trimestre       INTEGER,                  -- 1..4
  mes             INTEGER,                  -- 1..12
  matricula       TEXT,                     -- si es factura de coche
  ruta            TEXT,                     -- ubicación destino / actual del archivo
  nombre_archivo  TEXT,
  fuente          TEXT,                     -- 'onedrive' | 'gdrive' | 'email' | 'backfill'
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- dedup exacto por contenido (infalible, no depende de leer el número)
CREATE UNIQUE INDEX IF NOT EXISTS ux_facturas_hash ON facturas_registro (hash_contenido);
-- dedup por número dentro del mismo proveedor (sólo cuando hay número)
CREATE UNIQUE INDEX IF NOT EXISTS ux_facturas_prov_num
  ON facturas_registro (proveedor, numero_factura)
  WHERE numero_factura IS NOT NULL AND numero_factura <> '';
-- búsquedas frecuentes
CREATE INDEX IF NOT EXISTS ix_facturas_matricula ON facturas_registro (matricula) WHERE matricula IS NOT NULL;
CREATE INDEX IF NOT EXISTS ix_facturas_periodo   ON facturas_registro (anio, trimestre, mes);
CREATE INDEX IF NOT EXISTS ix_facturas_categoria ON facturas_registro (categoria);

-- =============================================================================
-- create-expedientes-carpetas.sql — Snapshot del inventario de carpetas de
-- expedientes en OneDrive (GESTORIA/<año>/<trimestre>/<mes>/<carpeta-coche>).
--
-- El CRM (Vercel) no puede leer OneDrive: un script del server POSTea a
-- /api/gestoria/expedientes-snapshot el estado ÍNTEGRO de un trimestre y el
-- endpoint reemplaza (DELETE + INSERT) todas las filas de ese (anio, trimestre).
--
-- archivos JSONB: array de {nombre, bytes} con el contenido de la carpeta.
-- matricula_norm: matrícula extraída del nombre de la carpeta (sin espacios ni
-- guiones, mayúsculas), NULL si no se pudo extraer.
--
-- Idempotente: seguro de correr varias veces. NO se aplica automáticamente.
-- =============================================================================

CREATE TABLE IF NOT EXISTS expedientes_carpetas (
  id             SERIAL PRIMARY KEY,
  anio           INT NOT NULL,
  trimestre      INT NOT NULL,
  mes            TEXT NOT NULL,
  carpeta        TEXT NOT NULL,
  matricula_norm TEXT,
  archivos       JSONB NOT NULL DEFAULT '[]',
  scanned_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (anio, mes, carpeta)
);

CREATE INDEX IF NOT EXISTS idx_expedientes_carpetas_periodo
  ON expedientes_carpetas (anio, trimestre);

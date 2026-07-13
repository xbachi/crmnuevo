-- =============================================================================
-- create-expedientes-renombres.sql — Traza de los renombrados de archivos de
-- expediente en OneDrive (POST /api/expedientes/normalizar-nombres).
--
-- Los documentos son de clientes reales: cada renombrado queda registrado con
-- el nombre viejo y el nuevo, para poder DESHACERLO. El endpoint se niega a
-- aplicar nada si esta tabla no existe.
--
-- accion:
--   'renombrado' → nombre_original pasó a llamarse nombre_nuevo
--   'borrado'    → duplicado exacto (mismo md5) eliminado; nombre_nuevo NULL
--
-- Idempotente: seguro de correr varias veces. NO se aplica automáticamente.
-- =============================================================================

CREATE TABLE IF NOT EXISTS expedientes_renombres (
  id              SERIAL PRIMARY KEY,
  anio            INT NOT NULL,
  trimestre       INT NOT NULL,
  mes             TEXT NOT NULL,
  carpeta         TEXT NOT NULL,
  nombre_original TEXT NOT NULL,
  nombre_nuevo    TEXT,
  hash            TEXT,
  accion          TEXT NOT NULL CHECK (accion IN ('renombrado', 'borrado')),
  user_id         TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_expedientes_renombres_periodo
  ON expedientes_renombres (anio, trimestre);
CREATE INDEX IF NOT EXISTS idx_expedientes_renombres_carpeta
  ON expedientes_renombres (carpeta);

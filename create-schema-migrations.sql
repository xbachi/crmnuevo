-- Registro de migraciones SQL aplicadas en Supabase.
-- Lo escribe scripts/apply-sql.js (--apply registra, --backfill rellena, --status consulta).
CREATE TABLE IF NOT EXISTS schema_migrations (
  filename   TEXT PRIMARY KEY,
  checksum   TEXT NOT NULL,
  applied_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  applied_by TEXT,
  notas      TEXT
);

-- fix-automation-logs-unique.sql
--
-- Adds a UNIQUE index on automation_logs.numero_factura so
-- POST /api/automation-log can use an atomic `ON CONFLICT (numero_factura)
-- DO UPDATE` upsert instead of a racy "UPDATE, then INSERT if no rows
-- affected" (two concurrent n8n reports for the same numero_factura could
-- both take the INSERT branch and create duplicate rows).
--
-- IMPORTANT: apply this in Supabase BEFORE deploying the route.ts change that
-- uses ON CONFLICT — without this index, ON CONFLICT (numero_factura) has no
-- matching unique constraint/index and the insert fails at runtime.
--
-- Idempotent: safe to run multiple times.

BEGIN;

-- Dedup first: keep the most recently created row per numero_factura (ties
-- broken by id), delete the rest. NULLs are left untouched — Postgres unique
-- indexes already allow multiple NULLs, so rows without a numero_factura
-- never conflict and don't need deduping.
DELETE FROM automation_logs a
USING automation_logs b
WHERE a.numero_factura IS NOT NULL
  AND a.numero_factura = b.numero_factura
  AND (a.created_at, a.id) < (b.created_at, b.id);

CREATE UNIQUE INDEX IF NOT EXISTS idx_automation_logs_numero_factura_unique
  ON automation_logs(numero_factura);

COMMIT;

-- =============================================================================
-- Post-migration check (run manually):
--
--   SELECT numero_factura, COUNT(*) FROM automation_logs
--   WHERE numero_factura IS NOT NULL
--   GROUP BY numero_factura HAVING COUNT(*) > 1;
--
-- Expected: 0 rows.
-- =============================================================================

-- =============================================================================
-- 0010 — Invoice deletion + number reuse (gap-filling)
--
-- Feature: an admin can delete an invoice from the history; its fiscal number
-- is freed and reused by the next issuance so the correlative never has gaps.
-- This is for internal corrections BEFORE invoices are filed with Hacienda.
--
-- Adds:
--   A) invoice_sequences.start_number — the first number the CRM assigns in
--      each series (its seeded next_number). Gap-filling only reuses holes at
--      or above this floor, so legacy IMPORTED rows below it are never touched.
--   B) invoice_deletion_logs — a paper trail that SURVIVES the row deletion
--      (invoice_audit_logs cascade-deletes with the invoice, so it can't keep
--      the record of the deletion itself).
--
-- Idempotent: safe to run multiple times.
-- =============================================================================

BEGIN;

-- A) Series floor -------------------------------------------------------------

ALTER TABLE invoice_sequences
  ADD COLUMN IF NOT EXISTS start_number INTEGER;

-- Backfill the floor for existing series: the lowest of the current
-- next_number and the lowest CRM-issued (non-IMPORTED) number already present.
-- On a freshly-seeded DB (nothing issued yet) this equals next_number
-- (REBU=23, VAT=4222).
UPDATE invoice_sequences seq
SET start_number = LEAST(
  seq.next_number,
  COALESCE(
    (SELECT MIN(i.number) FROM invoices i
      WHERE i.series = seq.series AND i.status <> 'IMPORTED'),
    seq.next_number
  )
)
WHERE start_number IS NULL;

-- B) Deletion log -------------------------------------------------------------

CREATE TABLE IF NOT EXISTS invoice_deletion_logs (
  id                  SERIAL PRIMARY KEY,
  invoice_id          INTEGER,            -- the id it had (no FK; row is gone)
  full_invoice_number TEXT        NOT NULL,
  series              TEXT        NOT NULL,
  number              INTEGER     NOT NULL,
  invoice_type        TEXT        NOT NULL,
  deal_id             INTEGER,
  b2b_venta_id        INTEGER,
  total_amount        NUMERIC(12,2),
  snapshot_json       JSONB,              -- full row at deletion time (forensics)
  reason              TEXT,
  deleted_by_user_id  TEXT,
  deleted_by_role     TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_invoice_deletion_full_number
  ON invoice_deletion_logs(full_invoice_number);
CREATE INDEX IF NOT EXISTS idx_invoice_deletion_created_at
  ON invoice_deletion_logs(created_at DESC);

COMMIT;

-- =============================================================================
-- Post-migration check (run manually):
--
--   SELECT invoice_type, series, next_number, start_number
--   FROM invoice_sequences ORDER BY id;
--
-- Expected: start_number <= next_number for every row (REBU/VAT = 23/4222 on
-- a freshly-seeded DB).
-- =============================================================================

-- =============================================================================
-- 0002 — Repair: bring invoice_sequences.next_number past any pre-existing
--               rows in the same series.
--
-- Why this is needed
-- ------------------
-- 0001-invoicing-module.sql seeds invoice_sequences at fixed next_number
-- values (VAT=F-2026:4222, REBU=R-2026:23) AND backfills legacy Deal.factura
-- rows into the same series with their original numbers parsed from the
-- filename. If any imported row has number >= seeded next_number, the
-- invoices.unique(series, number) constraint blocks every CRM-issued invoice:
--   issueInvoice() -> SELECT FOR UPDATE seq -> INSERT (series, next_number)
--     -> 23505 unique violation
--     -> ROLLBACK (sequence never advances)
--     -> next attempt hits exactly the same number -> 23505 forever -> 409.
--
-- This script unblocks the frozen state by advancing every sequence past
-- the highest number already present in its series. It does NOT filter by
-- status because invoices_unique_series_number is a full-table constraint
-- (VOIDED rows still occupy their (series, number) slot).
--
-- After this script runs once, the proactive MAX query inside
-- src/lib/invoiceService.ts > reserveAndInsert keeps next_number ahead of
-- the invoices table on every issue, so this repair is not expected to be
-- needed again. The WHERE clause makes it a safe no-op on re-run regardless.
-- =============================================================================

BEGIN;

UPDATE invoice_sequences seq
SET next_number = sub.max_number + 1,
    updated_at = NOW()
FROM (
  SELECT series, MAX(number) AS max_number
  FROM invoices
  GROUP BY series
) sub
WHERE seq.series = sub.series
  AND seq.next_number <= sub.max_number;

COMMIT;

-- =============================================================================
-- Post-run check (run manually):
--
--   SELECT s.invoice_type, s.series, s.next_number,
--          (SELECT MAX(number) FROM invoices i WHERE i.series = s.series)
--            AS max_in_invoices
--   FROM invoice_sequences s
--   WHERE s.is_active = TRUE;
--
-- Expected: next_number > max_in_invoices for every active row (or
-- max_in_invoices IS NULL if the series has no rows yet).
-- =============================================================================

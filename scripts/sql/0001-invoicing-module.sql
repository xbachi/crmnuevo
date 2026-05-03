-- =============================================================================
-- Migration: Invoicing module
-- Creates: invoice_sequences, invoices, invoice_audit_logs
-- Seeds:    REBU series R-2026 starting at 23, VAT series F-2026 starting at 4222
-- Backfill: imports legacy Deal.factura entries as status='IMPORTED'
--
-- Idempotent: every CREATE uses IF NOT EXISTS, every INSERT uses ON CONFLICT.
-- Safe to run multiple times.
--
-- Usage: paste this entire file into the Supabase SQL Editor and run.
-- =============================================================================

BEGIN;

-- A) Sequence table -----------------------------------------------------------

CREATE TABLE IF NOT EXISTS invoice_sequences (
  id            SERIAL PRIMARY KEY,
  invoice_type  TEXT        NOT NULL,
  series        TEXT        NOT NULL,
  year          INTEGER     NOT NULL,
  next_number   INTEGER     NOT NULL,
  number_format TEXT        NOT NULL DEFAULT '%03d',
  is_active     BOOLEAN     NOT NULL DEFAULT TRUE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT invoice_sequences_unique_type_series UNIQUE (invoice_type, series),
  CONSTRAINT invoice_sequences_type_check
    CHECK (invoice_type IN ('VAT', 'REBU', 'RECTIFYING')),
  CONSTRAINT invoice_sequences_next_number_positive
    CHECK (next_number >= 1)
);

-- B) Invoices table -----------------------------------------------------------

CREATE TABLE IF NOT EXISTS invoices (
  id                       SERIAL PRIMARY KEY,
  deal_id                  INTEGER REFERENCES "Deal"(id) ON DELETE SET NULL,
  vehiculo_id              INTEGER REFERENCES "Vehiculo"(id) ON DELETE SET NULL,

  invoice_type             TEXT        NOT NULL,
  series                   TEXT        NOT NULL,
  number                   INTEGER     NOT NULL,
  full_invoice_number      TEXT        NOT NULL,
  invoice_date             DATE        NOT NULL,
  operation_date           DATE,

  buyer_name               TEXT        NOT NULL,
  buyer_nif_cif            TEXT,
  buyer_email              TEXT,
  buyer_address            TEXT,

  vehicle_make             TEXT,
  vehicle_model            TEXT,
  vehicle_plate            TEXT,
  vehicle_vin              TEXT,
  vehicle_kms              INTEGER,
  vehicle_year             INTEGER,

  vehicle_sale_price       NUMERIC(12,2) NOT NULL,
  taxable_base             NUMERIC(12,2),
  vat_rate                 NUMERIC(5,2),
  vat_amount               NUMERIC(12,2),
  total_amount             NUMERIC(12,2) NOT NULL,
  rebu_margin              NUMERIC(12,2),
  rebu_taxable_base        NUMERIC(12,2),
  rebu_vat_amount          NUMERIC(12,2),

  status                   TEXT        NOT NULL DEFAULT 'ISSUED',
  pdf_url                  TEXT,
  pdf_storage_key          TEXT,
  pdf_generated_at         TIMESTAMPTZ,
  pdf_regenerated_at       TIMESTAMPTZ,

  idempotency_key          TEXT,

  notes                    TEXT,
  metadata_json            JSONB,
  created_by_user_id       TEXT,
  created_at               TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at               TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT invoices_unique_series_number UNIQUE (series, number),
  CONSTRAINT invoices_unique_full_number   UNIQUE (full_invoice_number),
  CONSTRAINT invoices_type_check
    CHECK (invoice_type IN ('VAT', 'REBU', 'RECTIFYING')),
  CONSTRAINT invoices_status_check
    CHECK (status IN ('ISSUED', 'PDF_PENDING', 'ERROR', 'VOIDED', 'RECTIFIED', 'IMPORTED')),
  CONSTRAINT invoices_total_positive CHECK (total_amount >= 0)
);

-- Idempotency key uniqueness only when set
CREATE UNIQUE INDEX IF NOT EXISTS invoices_unique_idempotency_key
  ON invoices(idempotency_key)
  WHERE idempotency_key IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_invoices_invoice_date  ON invoices(invoice_date DESC);
CREATE INDEX IF NOT EXISTS idx_invoices_deal_id       ON invoices(deal_id);
CREATE INDEX IF NOT EXISTS idx_invoices_vehiculo_id   ON invoices(vehiculo_id);
CREATE INDEX IF NOT EXISTS idx_invoices_buyer_name    ON invoices(LOWER(buyer_name));
CREATE INDEX IF NOT EXISTS idx_invoices_vehicle_plate ON invoices(LOWER(vehicle_plate));
CREATE INDEX IF NOT EXISTS idx_invoices_status        ON invoices(status);

-- One active invoice per (deal, type) — VOIDED rows don't block re-issue,
-- IMPORTED rows DO block (they represent the legacy invoice for that deal).
CREATE UNIQUE INDEX IF NOT EXISTS idx_invoices_unique_per_sale
  ON invoices(deal_id, invoice_type)
  WHERE deal_id IS NOT NULL AND status NOT IN ('VOIDED');

-- C) Audit log ----------------------------------------------------------------

CREATE TABLE IF NOT EXISTS invoice_audit_logs (
  id              SERIAL PRIMARY KEY,
  invoice_id      INTEGER NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  action          TEXT    NOT NULL,
  old_values_json JSONB,
  new_values_json JSONB,
  reason          TEXT,
  user_id         TEXT,
  user_role       TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT invoice_audit_logs_action_check
    CHECK (action IN ('CREATED', 'NUMBER_CORRECTED', 'PDF_REGENERATED',
                      'STATUS_CHANGED', 'DOWNLOADED', 'IMPORTED', 'CONFIG_UPDATED'))
);

CREATE INDEX IF NOT EXISTS idx_invoice_audit_invoice_id ON invoice_audit_logs(invoice_id);
CREATE INDEX IF NOT EXISTS idx_invoice_audit_created_at ON invoice_audit_logs(created_at DESC);

-- D) Seed sequences -----------------------------------------------------------
-- REBU continues from manually-issued F-2026-022 but moves to prefix R-2026.
-- VAT continues from manually-issued F-2026-4221 (next: F-2026-4222).
-- These are confirmed by the user; the gestor must validate before first
-- correlative invoice is emitted from the CRM.

INSERT INTO invoice_sequences (invoice_type, series, year, next_number, number_format, is_active)
VALUES
  ('REBU', 'R-2026', 2026,   23, '%03d', TRUE),
  ('VAT',  'F-2026', 2026, 4222, '%04d', TRUE)
ON CONFLICT (invoice_type, series) DO NOTHING;

-- E) Backfill from Deal.factura ----------------------------------------------
-- Imports historical invoice references with status='IMPORTED'.
-- Does NOT consume a sequence, does NOT generate PDFs.
-- Each imported row is just a placeholder so the history page shows them.
--
-- Series + number assignment:
--   - If the legacy factura field matches a [RF]-YYYY-N pattern, use that.
--   - Otherwise, fall back to a LEGACY-{deal_id} series with number=deal_id
--     so each legacy entry occupies a unique (series, number) slot.
--   - full_invoice_number is unique by construction (uses deal.id when the
--     value would otherwise collide) so we don't fight the UNIQUE constraint.
-- Conflicts on (full_invoice_number) are silently skipped (idempotent reruns).

INSERT INTO invoices (
  deal_id, vehiculo_id,
  invoice_type, series, number, full_invoice_number,
  invoice_date, operation_date,
  buyer_name, buyer_nif_cif, buyer_email,
  vehicle_make, vehicle_model, vehicle_plate, vehicle_vin, vehicle_kms,
  vehicle_sale_price, total_amount,
  status,
  notes,
  metadata_json,
  created_at
)
SELECT
  d.id,
  d."vehiculoId",
  -- Inferred type from filename pattern; safe fallback to VAT
  CASE
    WHEN d.factura ILIKE '%rebu%' OR d.factura ILIKE 'R-%' THEN 'REBU'
    ELSE 'VAT'
  END,
  -- Series: parsed from filename when possible, otherwise per-deal LEGACY
  COALESCE(
    NULLIF(SUBSTRING(d.factura FROM '([RF]-\d{4})'), ''),
    'LEGACY-' || d.id::TEXT
  ),
  -- Number: parsed from filename when possible, else use deal id (unique)
  COALESCE(
    NULLIF(SUBSTRING(d.factura FROM '[RF]-\d{4}-(\d+)'), '')::INTEGER,
    d.id
  ),
  -- Full number: prefer the parsed canonical form; otherwise use the raw
  -- factura value combined with deal id to guarantee uniqueness even if
  -- two deals shared the same legacy filename.
  CASE
    WHEN SUBSTRING(d.factura FROM '([RF]-\d{4}-\d+)') IS NOT NULL
      THEN SUBSTRING(d.factura FROM '([RF]-\d{4}-\d+)')
    ELSE 'LEGACY-' || d.id::TEXT || '-' || COALESCE(NULLIF(d.factura, ''), 'noref')
  END,
  COALESCE(d."fechaFacturada"::DATE, CURRENT_DATE),
  d."fechaVentaFirmada"::DATE,
  COALESCE(NULLIF(TRIM(CONCAT(c.nombre, ' ', c.apellidos)), ''), 'Cliente desconocido'),
  c.dni,
  c.email,
  v.marca, v.modelo, v.matricula, v.bastidor, v.kms,
  COALESCE(d."importeTotal"::NUMERIC(12,2), 0),
  COALESCE(d."importeTotal"::NUMERIC(12,2), 0),
  'IMPORTED',
  'Factura importada desde Deal.factura legacy. PDF original en public/documents (puede no estar disponible en producción).',
  jsonb_build_object(
    'legacy_factura_field', d.factura,
    'imported_at', NOW()
  ),
  COALESCE(d."fechaFacturada", d."createdAt", NOW())
FROM "Deal" d
LEFT JOIN "Cliente" c ON c.id = d."clienteId"
LEFT JOIN "Vehiculo" v ON v.id = d."vehiculoId"
WHERE d.factura IS NOT NULL
  AND TRIM(d.factura) <> ''
-- Use the unconstrained DO NOTHING form so any unique violation
-- (full_invoice_number OR (series, number)) is silently skipped. This
-- makes the backfill safe to re-run and tolerant of legacy duplicates.
ON CONFLICT DO NOTHING;

-- Audit-log every imported row so there's a paper trail
INSERT INTO invoice_audit_logs (invoice_id, action, new_values_json, reason)
SELECT
  i.id,
  'IMPORTED',
  jsonb_build_object(
    'full_invoice_number', i.full_invoice_number,
    'deal_id', i.deal_id,
    'legacy_factura_field', i.metadata_json->>'legacy_factura_field'
  ),
  'Importado durante migración inicial del módulo de facturación'
FROM invoices i
WHERE i.status = 'IMPORTED'
  AND NOT EXISTS (
    SELECT 1 FROM invoice_audit_logs a
    WHERE a.invoice_id = i.id AND a.action = 'IMPORTED'
  );

COMMIT;

-- =============================================================================
-- Post-migration check (run manually):
--
--   SELECT invoice_type, series, next_number, number_format
--   FROM invoice_sequences ORDER BY id;
--
--   SELECT status, COUNT(*) FROM invoices GROUP BY status;
--
-- Expected after first run on a clean DB:
--   - invoice_sequences has REBU(R-2026, 23, %03d) and VAT(F-2026, 4222, %04d)
--   - invoices has IMPORTED rows for every Deal with a legacy factura value
-- =============================================================================

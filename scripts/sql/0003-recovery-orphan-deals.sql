-- =============================================================================
-- 0003 — Recovery: import deals marked 'facturado' that the 0001 backfill
--                  silently dropped due to filename collisions.
--
-- Why this is needed
-- ------------------
-- 0001 parses [RF]-YYYY-N from Deal.factura and uses the parsed value as
-- full_invoice_number (UNIQUE). When two deals share the same legacy
-- filename (e.g. both have 'factura-iva-F-2026-4230.pdf'), only the first
-- wins; the rest are silently dropped by `ON CONFLICT DO NOTHING`. The
-- diagnostic query (Deal.estado='facturado' LEFT JOIN invoices) confirmed
-- 9 such orphans on prod (2026-05-11).
--
-- What this does
-- --------------
-- For each orphan deal, insert one row into `invoices` using a per-deal
-- LEGACY-{deal_id} series so it cannot collide with anything in F-2026 /
-- R-2026 (the fiscal series stay untouched and correlative). The row is:
--   - status='IMPORTED'           (matches 0001's backfill semantics)
--   - notes='REVISAR: …'          so the gestor finds them in the history
--   - metadata_json keeps the original Deal.factura + parsed canonical so
--     the gestor can reconcile which real invoice number each one is
--
-- Idempotent: WHERE NOT EXISTS (...) prevents double-inserts if the
-- gestor re-runs after manual cleanup.
-- =============================================================================

BEGIN;

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
  -- REBU when the legacy filename says so; same heuristic as 0001
  CASE
    WHEN d.factura ILIKE '%rebu%' OR d.factura ILIKE 'R-%' THEN 'REBU'
    ELSE 'VAT'
  END,
  -- Per-deal LEGACY series: guarantees uniqueness regardless of legacy
  -- filename collisions, and keeps the fiscal series untouched.
  'LEGACY-' || d.id::TEXT,
  d.id,
  'LEGACY-' || d.id::TEXT,
  COALESCE(d."fechaFacturada"::DATE, d."fechaVentaFirmada"::DATE, CURRENT_DATE),
  d."fechaVentaFirmada"::DATE,
  COALESCE(NULLIF(TRIM(CONCAT(c.nombre, ' ', COALESCE(c.apellidos, ''))), ''), 'Cliente desconocido'),
  c.dni,
  c.email,
  v.marca, v.modelo, v.matricula, v.bastidor, v.kms,
  COALESCE(d."importeTotal"::NUMERIC(12,2), 0),
  COALESCE(d."importeTotal"::NUMERIC(12,2), 0),
  'IMPORTED',
  'REVISAR: factura legacy compartía nombre de archivo con otro deal; importada como LEGACY para no perder traza. El número fiscal real (F-2026-XXXX) está en metadata_json.legacy_factura_field y debe asignarse manualmente desde el admin si se conoce.',
  jsonb_build_object(
    'legacy_factura_field', d.factura,
    'parsed_collision_number', SUBSTRING(d.factura FROM '([RF]-\d{4}-\d+)'),
    'imported_at', NOW(),
    'recovery_run', '0003-recovery-orphan-deals'
  ),
  COALESCE(d."fechaFacturada", d."createdAt", NOW())
FROM "Deal" d
LEFT JOIN "Cliente"  c ON c.id = d."clienteId"
LEFT JOIN "Vehiculo" v ON v.id = d."vehiculoId"
WHERE d.estado = 'facturado'
  AND d.factura IS NOT NULL
  AND TRIM(d.factura) <> ''
  AND NOT EXISTS (SELECT 1 FROM invoices i WHERE i.deal_id = d.id)
ON CONFLICT DO NOTHING;

-- Audit trail for each recovered row
INSERT INTO invoice_audit_logs (invoice_id, action, new_values_json, reason)
SELECT
  i.id,
  'IMPORTED',
  jsonb_build_object(
    'full_invoice_number', i.full_invoice_number,
    'deal_id', i.deal_id,
    'legacy_factura_field', i.metadata_json->>'legacy_factura_field',
    'parsed_collision_number', i.metadata_json->>'parsed_collision_number'
  ),
  'Recuperación 0003: deal facturado huérfano sin row en invoices por colisión de filename en 0001'
FROM invoices i
WHERE i.metadata_json->>'recovery_run' = '0003-recovery-orphan-deals'
  AND NOT EXISTS (
    SELECT 1 FROM invoice_audit_logs a
    WHERE a.invoice_id = i.id AND a.action = 'IMPORTED'
  );

COMMIT;

-- =============================================================================
-- Post-run checks (run manually):
--
-- 1) Conteo de filas recuperadas (esperado: 9 en prod a 2026-05-11):
--      SELECT COUNT(*) FROM invoices
--      WHERE metadata_json->>'recovery_run' = '0003-recovery-orphan-deals';
--
-- 2) Listado para revisión del gestor — cada fila muestra el filename
--    legacy y el número fiscal real que el filename pretende referenciar.
--    Para los casos donde varios deals comparten el mismo filename, el
--    gestor decide cuál realmente corresponde a ese número y deja al
--    resto como LEGACY (o les asigna otro número conocido):
--
--      SELECT i.deal_id, d.numero AS deal_numero, i.full_invoice_number,
--             i.invoice_date, i.buyer_name,
--             i.metadata_json->>'legacy_factura_field'    AS legacy_field,
--             i.metadata_json->>'parsed_collision_number' AS pretendia_ser
--      FROM invoices i
--      JOIN "Deal" d ON d.id = i.deal_id
--      WHERE i.metadata_json->>'recovery_run' = '0003-recovery-orphan-deals'
--      ORDER BY i.invoice_date DESC;
--
-- 3) Confirmar que NO se crearon huérfanos nuevos: la query D del
--    diagnóstico inicial debería devolver 0 filas.
-- =============================================================================

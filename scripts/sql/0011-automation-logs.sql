-- =============================================================================
-- 0011 — Registro de automatizaciones (auditoría de cada venta automatizada)
--
-- Cada vez que se emite una factura de venta, el receptor de n8n archiva la
-- factura, busca la de compra y envía el mail a la gestora; al terminar
-- reporta el resultado de cada acción acá (✓/✗ + notas). El CRM lo muestra en
-- una sección para detectar a mano lo que falló (mail no enviado, compra sin
-- localizar, etc.).
--
-- Idempotente: seguro de correr varias veces.
-- =============================================================================
CREATE TABLE IF NOT EXISTS automation_logs (
  id              SERIAL PRIMARY KEY,
  tipo            TEXT        NOT NULL DEFAULT 'factura_venta',
  numero_factura  TEXT,
  coche           TEXT,        -- marca + modelo
  matricula       TEXT,
  invoice_type    TEXT,        -- VAT / REBU
  venta_guardada  BOOLEAN,     -- ✓ archivada en 1_Ventas + expediente
  compra_adjunta  BOOLEAN,     -- ✓ factura de compra localizada y copiada
  email_gestora   BOOLEAN,     -- ✓ mail enviado a la gestora
  ok              BOOLEAN,     -- resumen: todo salió bien
  notas           TEXT,        -- avisos legibles para acción manual
  detalle_json    JSONB,       -- reporte completo (forense)
  created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_automation_logs_created ON automation_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_automation_logs_ok ON automation_logs(ok);

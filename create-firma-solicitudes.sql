-- Solicitudes de firma digital de contratos (adapter Signaturit detrás de
-- env flag SIGNATURIT_API_KEY; ver src/lib/firmaDigital.ts).
-- El estado lo actualiza POST /api/firma/webhook. La descarga/archivado del
-- PDF firmado a OneDrive la hace n8n después (el CRM en Vercel no lo ve).

CREATE TABLE IF NOT EXISTS firma_solicitudes (
  id               SERIAL PRIMARY KEY,
  deal_id          INTEGER NOT NULL,
  proveedor        TEXT NOT NULL,           -- 'signaturit'
  solicitud_id     TEXT NOT NULL,           -- id de la signature request en el proveedor
  estado           TEXT NOT NULL DEFAULT 'enviada' CHECK (estado IN
                     ('enviada','completada','cancelada')),
  pdf_firmado_ruta TEXT,                    -- ruta/URL del documento firmado (la llena el webhook)
  ultimo_evento    JSONB,                   -- último evento crudo recibido del proveedor
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS ux_firma_solicitudes_prov_id
  ON firma_solicitudes (proveedor, solicitud_id);
CREATE INDEX IF NOT EXISTS ix_firma_solicitudes_deal ON firma_solicitudes (deal_id);

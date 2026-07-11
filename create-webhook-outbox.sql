-- Outbox de webhooks salientes (n8n / gestoría).
--
-- C-23: notifyGestoriaInvoice() es best-effort, sin retry; si el webhook
-- falla o n8n está caído, hoy no queda NINGÚN rastro (automation_logs sólo
-- se llena si n8n responde). Esta tabla registra CADA intento de envío ANTES
-- o junto con la llamada, así el fallo deja de ser invisible: siempre hay
-- una fila, y se puede reintentar manualmente vía
-- POST /api/admin/webhook-outbox/retry.
--
-- NO se aplica automáticamente (no corre en el flujo normal de migraciones);
-- hay que ejecutarla a mano contra la DB.
CREATE TABLE IF NOT EXISTS webhook_outbox (
  id              SERIAL PRIMARY KEY,
  tipo            TEXT        NOT NULL DEFAULT 'factura_venta',
  payload         JSONB       NOT NULL,
  numero_factura  TEXT,
  intentos        INTEGER     NOT NULL DEFAULT 0,
  max_intentos    INTEGER     NOT NULL DEFAULT 5,
  estado          TEXT        NOT NULL DEFAULT 'pendiente', -- 'pendiente' | 'enviado' | 'agotado'
  ultimo_error    TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  enviado_at      TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_webhook_outbox_estado ON webhook_outbox(estado);
CREATE INDEX IF NOT EXISTS idx_webhook_outbox_created ON webhook_outbox(created_at DESC);

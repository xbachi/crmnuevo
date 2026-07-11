-- Cola durable para entregar facturas emitidas a la automatización de gestoría.
BEGIN;

ALTER TABLE invoices
  ADD COLUMN IF NOT EXISTS gestoria_notified_at TIMESTAMPTZ;

CREATE TABLE IF NOT EXISTS webhook_outbox (
  id              BIGSERIAL PRIMARY KEY,
  event_type      TEXT NOT NULL,
  dedupe_key      TEXT NOT NULL UNIQUE,
  invoice_id      INTEGER NOT NULL REFERENCES invoices(id) ON DELETE RESTRICT,
  payload_json    JSONB NOT NULL,
  status          TEXT NOT NULL DEFAULT 'PENDING',
  attempts        INTEGER NOT NULL DEFAULT 0,
  next_attempt_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_error      TEXT,
  delivered_at    TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT webhook_outbox_event_check
    CHECK (event_type IN ('GESTORIA_INVOICE')),
  CONSTRAINT webhook_outbox_status_check
    CHECK (status IN ('PENDING', 'PROCESSING', 'DELIVERED', 'DEAD')),
  CONSTRAINT webhook_outbox_attempts_check CHECK (attempts >= 0),
  CONSTRAINT webhook_outbox_delivery_check
    CHECK ((status = 'DELIVERED') = (delivered_at IS NOT NULL))
);

CREATE INDEX IF NOT EXISTS idx_webhook_outbox_pending
  ON webhook_outbox(next_attempt_at, id)
  WHERE status = 'PENDING';

CREATE INDEX IF NOT EXISTS idx_webhook_outbox_processing
  ON webhook_outbox(updated_at, id)
  WHERE status = 'PROCESSING';

COMMIT;

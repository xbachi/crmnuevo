-- create-deal-mensajes.sql
--
-- Historial de mensajes enviados al cliente final desde la ficha del deal:
-- email (SMTP, src/lib/mailer.ts) o WhatsApp (el navegador abre wa.me; aquí
-- solo queda el registro). Ver src/lib/plantillasMensajes.ts y
-- src/app/api/deals/[id]/mensajes/route.ts.

CREATE TABLE IF NOT EXISTS deal_mensajes (
  id SERIAL PRIMARY KEY,
  deal_id INTEGER NOT NULL,
  plantilla TEXT NOT NULL,
  canal TEXT NOT NULL CHECK (canal IN ('email', 'whatsapp')),
  destinatario TEXT,
  asunto TEXT,
  cuerpo TEXT NOT NULL,
  enviado_por TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS deal_mensajes_deal_id_idx
  ON deal_mensajes (deal_id, created_at DESC);

-- Control:
--   SELECT * FROM deal_mensajes ORDER BY created_at DESC LIMIT 20;

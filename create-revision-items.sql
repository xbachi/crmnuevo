-- Bandeja única de revisión de documentos (patrón Dext/Hubdoc).
-- Los items dudosos del pipeline de facturas (n8n → OneDrive) que hoy caen
-- repartidos en 4 lugares (VERIFICACION MANUAL de OneDrive, IMAP "Revisar
-- manual", gastos rechazados por rango, filas de facturas_registro sin
-- fecha/importe) se encolan acá para aprobación de 1 clic desde el CRM.
-- Encola n8n vía POST /api/revision (X-Webhook-Secret) o el propio CRM
-- vía POST /api/revision/sync (deriva de facturas_registro).

CREATE TABLE IF NOT EXISTS revision_items (
  id           SERIAL PRIMARY KEY,
  origen       TEXT NOT NULL CHECK (origen IN
                 ('verificacion-manual','gasto-rechazado','registro-incompleto','imap-revisar','otro')),
  estado       TEXT NOT NULL DEFAULT 'pendiente' CHECK (estado IN
                 ('pendiente','aprobado','descartado')),
  titulo       TEXT NOT NULL,
  -- campos extraídos: proveedor, numeroFactura, fecha, importe, matricula,
  -- categoria, rutaArchivo, motivo, tipoAccion ('gasto'|'registro'), registroId,
  -- gasto (body original para /api/vehiculos/gasto)...
  payload      JSONB NOT NULL DEFAULT '{}',
  dedup_key    TEXT UNIQUE,                 -- mismo item nunca se encola dos veces
  resolucion   JSONB,                       -- accion + datos corregidos + resultado
  resuelto_por TEXT,                        -- uid de la sesión que resolvió
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  resuelto_at  TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS ix_revision_items_estado ON revision_items (estado);

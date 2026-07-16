-- Rastro de auditoría fiscal (append-only).
-- Una vez declarado un trimestre, "quién cambió qué y por qué" deja de ser
-- curiosidad y pasa a ser la defensa ante una inspección. Guarda el diff campo
-- a campo, no el estado final: el estado ya está en la tabla origen.
--
-- APPEND-ONLY POR CONVENCIÓN: la app NUNCA hace UPDATE ni DELETE sobre esta
-- tabla (no hay guard en DB; corregir una entrada = insertar otra que la
-- explique). Un log que se puede reescribir no prueba nada.
--
-- Idempotente. NO se aplica automáticamente: correr a mano en Supabase.

CREATE TABLE IF NOT EXISTS fiscal_audit_log (
  id          BIGSERIAL PRIMARY KEY,
  tabla       TEXT NOT NULL,                       -- 'facturas_registro' | 'facturas_registro_lineas' | 'proveedores'
  fila_id     INT NOT NULL,
  accion      TEXT NOT NULL,                       -- 'crear'|'editar'|'transicion'|'validar'|'correccion-post-declaracion'
  cambios     JSONB NOT NULL DEFAULT '{}',         -- {campo:{antes,despues}}
  motivo      TEXT,                                -- obligatorio en la app para correccion-post-declaracion
  actor       TEXT NOT NULL,                       -- 'uid:N' | 'n8n' | 'sistema'
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- historial de una fila concreta (la vista de ficha)
CREATE INDEX IF NOT EXISTS ix_audit_fila  ON fiscal_audit_log (tabla, fila_id);
-- actividad reciente (la bandeja de revisión)
CREATE INDEX IF NOT EXISTS ix_audit_fecha ON fiscal_audit_log (created_at DESC);

COMMENT ON TABLE fiscal_audit_log IS
  'Append-only por convención: la app nunca hace UPDATE/DELETE acá. Corregir = insertar una entrada nueva.';
COMMENT ON COLUMN fiscal_audit_log.cambios IS
  'Diff campo a campo: {campo: {antes, despues}}. Sin FK a fila_id: el log sobrevive al borrado de la fila origen.';

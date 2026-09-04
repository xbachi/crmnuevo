-- Amplía el dominio de revision_items.origen con 'alertas'.
--
-- POR QUÉ: el cron diario /api/cron/alertas (src/lib/alertas.ts) encola en la
-- bandeja de revisión las alertas operativas del CRM (reservas caducadas,
-- recordatorios vencidos, cambios de nombre sin cerrar, cobros pendientes,
-- stock parado, margen negativo). Necesita un `origen` propio para que la
-- bandeja las distinga; el CHECK vigente (fix-revision-items-origen.sql) no lo
-- admite y el INSERT reventaría.
--
-- Idempotente (DROP IF EXISTS + ADD). Conserva TODOS los valores previos.
-- NO se aplica automáticamente: correr a mano en Supabase ANTES del primer
-- disparo del cron (si no, el cron responde con errores.bandeja y avisa por mail).

ALTER TABLE revision_items DROP CONSTRAINT IF EXISTS revision_items_origen_check;

ALTER TABLE revision_items ADD CONSTRAINT revision_items_origen_check
  CHECK (origen IN (
    'verificacion-manual',
    'gasto-rechazado',
    'registro-incompleto',
    'imap-revisar',
    'otro',
    'fiscal-duplicado',
    'alertas'
  ));

COMMENT ON COLUMN revision_items.origen IS
  'Fuente del item. fiscal-duplicado = par detectado por /api/fiscal/duplicados/scan. alertas = aviso operativo del cron diario /api/cron/alertas (dedup_key alertas:<tipo>:<ref>; payload.url enlaza a la ficha).';

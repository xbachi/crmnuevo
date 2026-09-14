-- Amplía el dominio de revision_items.origen con 'ficha_tecnica'.
--
-- POR QUÉ: el cron diario /api/cron/fichas-tecnicas (src/lib/fichaTecnica.ts)
-- cruza los datos de cada coche publicado contra su ficha técnica (tarjeta ITV
-- extraída de la carpeta de OneDrive) y encola en la bandeja de revisión todo lo
-- que no puede corregir solo: matrícula y bastidor que no cuadran, datos de
-- WordPress distintos, confianza baja, y los coches publicados sin ficha en la
-- carpeta. Necesita un `origen` propio para que la bandeja las distinga; el CHECK
-- vigente (add-revision-items-origen-alertas.sql) no lo admite y el INSERT
-- reventaría.
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
    'alertas',
    'ficha_tecnica'
  ));

COMMENT ON COLUMN revision_items.origen IS
  'Fuente del item. fiscal-duplicado = par detectado por /api/fiscal/duplicados/scan. alertas = aviso operativo del cron diario /api/cron/alertas (dedup_key alertas:<tipo>:<ref>; payload.url enlaza a la ficha). ficha_tecnica = discrepancia entre el coche y su tarjeta ITV detectada por /api/cron/fichas-tecnicas (dedup_key ficha_tecnica:<vehiculo_id>:<campo>:<hash>; una ficha nueva vuelve a avisar).';

-- Amplía el dominio de revision_items.origen con 'fiscal-duplicado'.
--
-- POR QUÉ: el scan de duplicados difusos (POST /api/fiscal/duplicados/scan) caza
-- el caso que el hash md5 NO puede cazar — el mismo comprobante re-emitido o
-- re-escaneado, con bytes distintos → hash distinto → dos filas. El scan nunca
-- borra ni anula (regla dura del proyecto): marca el más nuevo y encola el par en
-- la bandeja de revisión para que lo decida un humano. Ese encolado necesita un
-- `origen` propio; el CHECK original de create-revision-items.sql no lo tiene y
-- el INSERT reventaría.
--
-- Idempotente (DROP IF EXISTS + ADD). Conserva TODOS los valores del dominio
-- viejo: las filas ya encoladas con los origenes previos deben seguir válidas.
-- NO se aplica automáticamente: correr a mano en Supabase.

ALTER TABLE revision_items DROP CONSTRAINT IF EXISTS revision_items_origen_check;

ALTER TABLE revision_items ADD CONSTRAINT revision_items_origen_check
  CHECK (origen IN (
    'verificacion-manual',
    'gasto-rechazado',
    'registro-incompleto',
    'imap-revisar',
    'otro',
    'fiscal-duplicado'
  ));

COMMENT ON COLUMN revision_items.origen IS
  'Fuente del item. fiscal-duplicado = par detectado por /api/fiscal/duplicados/scan (mismo proveedor+importe+fecha±3d, hash distinto): el scan solo marca y encola, la decisión (anular/mantener) es humana.';

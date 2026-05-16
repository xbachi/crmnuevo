-- 0004-backfill-deal-factura-from-invoices.sql
--
-- Repara deals que ya tienen factura emitida en la tabla `invoices` pero
-- cuya fila en "Deal" quedó stale por el bug previo: issueInvoice() no
-- propagaba al Deal (estado, factura, fechaFacturada).
--
-- Síntomas que arregla:
--   * Deal.estado en 'vendido' aunque haya factura emitida.
--   * Deal.factura NULL → panel "Documentación" muestra "No generada".
--   * Contadores Vendido/Facturado mal en /deals.
--
-- Idempotente: el WHERE filtra filas ya sanas → re-ejecutar es no-op.
-- Defensivo: COALESCE(NULLIF(...)) nunca pisa una referencia legacy
-- preexistente en Deal.factura (importante para deals IMPORTED del 0001).
--
-- Ejecutar manualmente desde el SQL Editor de Supabase (convención de
-- los 0001-0003). Verificación antes/después:
--
--   SELECT COUNT(*) FROM "Deal" d
--    JOIN invoices i ON i.deal_id = d.id AND i.status NOT IN ('VOIDED')
--    WHERE d.estado <> 'facturado' OR d.factura IS NULL;
--
-- Debe pasar a 0 tras la ejecución.

BEGIN;

WITH latest AS (
  SELECT DISTINCT ON (deal_id)
         deal_id,
         full_invoice_number,
         invoice_date
    FROM invoices
   WHERE deal_id IS NOT NULL
     AND status NOT IN ('VOIDED')
   ORDER BY deal_id, id DESC
)
UPDATE "Deal" d
   SET estado          = CASE WHEN d.estado <> 'facturado' THEN 'facturado' ELSE d.estado END,
       factura         = COALESCE(NULLIF(d.factura, ''), l.full_invoice_number),
       "fechaFacturada" = COALESCE(d."fechaFacturada", l.invoice_date::timestamp)
  FROM latest l
 WHERE d.id = l.deal_id
   AND (
        d.estado <> 'facturado'
        OR d.factura IS NULL OR d.factura = ''
        OR d."fechaFacturada" IS NULL
   );

COMMIT;

-- Impide que una factura de un proveedor se reasigne silenciosamente a otro
-- vehículo. Si existen duplicados normalizados, la creación del índice falla
-- y obliga a revisarlos manualmente antes de volver a ejecutar la migración.
BEGIN;

LOCK TABLE gasto_facturas IN SHARE ROW EXCLUSIVE MODE;

UPDATE gasto_facturas
SET proveedor = tipo
WHERE proveedor IS NULL OR BTRIM(proveedor) = '';

ALTER TABLE gasto_facturas
  DROP CONSTRAINT IF EXISTS gasto_facturas_tipo_numero_factura_key;

CREATE UNIQUE INDEX IF NOT EXISTS uq_gasto_facturas_proveedor_numero
  ON gasto_facturas (
    LOWER(BTRIM(COALESCE(NULLIF(proveedor, ''), tipo))),
    UPPER(REGEXP_REPLACE(BTRIM(numero_factura), '\\s+', '', 'g'))
  );

COMMIT;

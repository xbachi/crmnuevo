-- Fortalece la identidad de facturas de proveedor frente a diferencias de
-- espacios, mayúsculas y separadores (F-123, F/123 y F 123 son la misma).
-- Si ya existen colisiones normalizadas, aborta sin modificar los índices para
-- que los registros se revisen manualmente.
BEGIN;

LOCK TABLE gasto_facturas, facturas_registro IN SHARE ROW EXCLUSIVE MODE;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
      FROM gasto_facturas
     GROUP BY
       LOWER(REGEXP_REPLACE(BTRIM(COALESCE(NULLIF(proveedor, ''), tipo)), '\s+', ' ', 'g')),
       UPPER(REGEXP_REPLACE(BTRIM(numero_factura), '[^A-Za-z0-9]+', '', 'g'))
    HAVING COUNT(*) > 1
  ) THEN
    RAISE EXCEPTION 'gasto_facturas contiene números duplicados tras normalizar; requiere revisión manual';
  END IF;

  IF EXISTS (
    SELECT 1
      FROM facturas_registro
     WHERE numero_factura IS NOT NULL
       AND BTRIM(numero_factura) <> ''
     GROUP BY
       LOWER(REGEXP_REPLACE(BTRIM(proveedor), '\s+', ' ', 'g')),
       UPPER(REGEXP_REPLACE(BTRIM(numero_factura), '[^A-Za-z0-9]+', '', 'g'))
    HAVING COUNT(*) > 1
  ) THEN
    RAISE EXCEPTION 'facturas_registro contiene números duplicados tras normalizar; requiere revisión manual';
  END IF;
END $$;

DROP INDEX IF EXISTS uq_gasto_facturas_proveedor_numero;
CREATE UNIQUE INDEX uq_gasto_facturas_proveedor_numero
  ON gasto_facturas (
    LOWER(REGEXP_REPLACE(BTRIM(COALESCE(NULLIF(proveedor, ''), tipo)), '\s+', ' ', 'g')),
    UPPER(REGEXP_REPLACE(BTRIM(numero_factura), '[^A-Za-z0-9]+', '', 'g'))
  );

DROP INDEX IF EXISTS ux_facturas_prov_num;
CREATE UNIQUE INDEX ux_facturas_prov_num
  ON facturas_registro (
    LOWER(REGEXP_REPLACE(BTRIM(proveedor), '\s+', ' ', 'g')),
    UPPER(REGEXP_REPLACE(BTRIM(numero_factura), '[^A-Za-z0-9]+', '', 'g'))
  )
  WHERE numero_factura IS NOT NULL AND BTRIM(numero_factura) <> '';

COMMIT;

-- fix-vehiculo-tipo-normalizacion.sql
--
-- La columna "Vehiculo".tipo tenía doble codificación: el canónico correcto son
-- LETRAS ('C' Compra, 'I' Inversor, 'D' Depósito Venta, 'R' Coche R), pero los
-- modales de edición viejos guardaban PALABRAS ('Compra', 'Inversor',
-- 'Deposito Venta', 'Coche R'…), corrompiendo el dato. El backend filtra por
-- letra (api/coches-r, api/depositos, getVehiculos con `v.tipo = $x`), así que
-- las filas con palabra quedaban fuera de esos filtros.
--
-- Esta migración normaliza todas las variantes conocidas (con/sin tilde, case
-- raro, espacios) a la letra canónica, y realinea "esCocheInversor" con la
-- regla real (tipo='I' AND inversorId IS NOT NULL). No borra ninguna fila.
--
-- Idempotente: correr de nuevo no cambia filas ya normalizadas.

BEGIN;

-- 1) Palabra/variante → letra canónica. TRIM + colapso de espacios + UPPER para
--    ser insensible a case, tildes y espacios internos.
UPDATE "Vehiculo"
SET tipo = CASE UPPER(REGEXP_REPLACE(TRIM(tipo), '\s+', ' ', 'g'))
  WHEN 'C' THEN 'C'
  WHEN 'COMPRA' THEN 'C'
  WHEN 'I' THEN 'I'
  WHEN 'INVERSOR' THEN 'I'
  WHEN 'D' THEN 'D'
  WHEN 'DEPOSITO' THEN 'D'
  WHEN 'DEPÓSITO' THEN 'D'
  WHEN 'DEPOSITO VENTA' THEN 'D'
  WHEN 'DEPÓSITO VENTA' THEN 'D'
  WHEN 'R' THEN 'R'
  WHEN 'COCHE R' THEN 'R'
  ELSE tipo  -- desconocido: no tocar, queda para inspección manual
END
WHERE tipo IS NOT NULL;

-- 2) Coherencia de esCocheInversor: solo es true si el tipo es Inversor y hay
--    un inversor asignado. Cualquier otra combinación → false.
UPDATE "Vehiculo"
SET "esCocheInversor" = (tipo = 'I' AND "inversorId" IS NOT NULL);

COMMIT;

-- =============================================================================
-- Controles post-migración (correr manualmente):
--
-- a) Distribución de tipos: esperado solo 'C','I','D','R','M' (y NULL si aplica).
--    ('M' = venta manual sin stock, creado por api/sales/manual-issue; se deja tal cual.)
--      SELECT tipo, COUNT(*) FROM "Vehiculo" GROUP BY tipo ORDER BY tipo;
--
-- b) Variantes que NO se pudieron mapear (palabras raras / basura): esperado 0.
--      SELECT tipo, COUNT(*) FROM "Vehiculo"
--      WHERE tipo IS NOT NULL AND tipo NOT IN ('C','I','D','R','M')
--      GROUP BY tipo;
--
-- c) Inversores sin inversorId asignado (dato a revisar, NO se borra nada):
--      SELECT id, referencia, tipo, "inversorId"
--      FROM "Vehiculo"
--      WHERE tipo = 'I' AND "inversorId" IS NULL;
-- =============================================================================

-- Identidad fuerte del vehículo (auditoría: matching débil por matrícula).
-- Problema: matricula es texto libre (hay "9500 KBD" con espacio en prod) y el
-- matching se hace con REPLACE/UPPER query-time + LIMIT 1 → hubo un vehículo
-- duplicado real (dos filas para la misma matrícula).
-- matricula_norm = matrícula sin espacios/puntos/guiones en mayúsculas,
-- espejo de normPlate() en src/lib/gastoMapping.ts.
-- Nota: se usa REGEXP_REPLACE con args constantes (IMMUTABLE en Postgres, apto
-- para columna generada). [[:space:].-] es la forma POSIX segura de [\s.\-].
-- Idempotente. NO aplicar en caliente sin revisar: ver PASO POSTERIOR abajo.

ALTER TABLE "Vehiculo" ADD COLUMN IF NOT EXISTS matricula_norm TEXT
  GENERATED ALWAYS AS (
    UPPER(REGEXP_REPLACE(COALESCE(matricula, ''), '[[:space:].-]', '', 'g'))
  ) STORED;

CREATE INDEX IF NOT EXISTS idx_vehiculo_matricula_norm
  ON "Vehiculo" (matricula_norm);

-- ─────────────────────────────────────────────────────────────────────────────
-- PASO POSTERIOR (NO ejecutar todavía):
-- El índice UNIQUE parcial de abajo es la garantía definitiva contra vehículos
-- duplicados por matrícula, pero HOY fallaría al crearse si quedan duplicados.
-- Orden correcto:
--   1) aplicar este archivo (columna + índice normal),
--   2) revisar duplicados con scripts/check-vehiculo-dups.js (o la query):
--
--      SELECT matricula_norm, COUNT(*) AS n,
--             ARRAY_AGG(id ORDER BY id) AS ids,
--             ARRAY_AGG(matricula ORDER BY id) AS matriculas
--        FROM "Vehiculo"
--       WHERE matricula_norm <> ''
--       GROUP BY matricula_norm
--      HAVING COUNT(*) > 1;
--
--   3) BORRAR/fusionar a mano la fila duplicada de cada grupo (dejando una),
--   4) recién entonces ejecutar:
--
-- CREATE UNIQUE INDEX IF NOT EXISTS uq_vehiculo_matricula_norm
--   ON "Vehiculo" (matricula_norm)
--   WHERE matricula_norm <> '';
-- ─────────────────────────────────────────────────────────────────────────────

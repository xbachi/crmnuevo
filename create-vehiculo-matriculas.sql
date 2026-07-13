-- Historial de matrículas de un vehículo (alias).
--
-- Problema real: el BMW M2 (id 398) se vendió con matrícula PROVISIONAL
-- (5732BDR) y la DGT le asignó después la DEFINITIVA (5439NNW). La factura
-- emitida, su expediente, la carpeta de OneDrive y la fila de CB se quedan con
-- la provisional (el documento fiscal era correcto ese día), pero el COCHE pasa
-- a tener la definitiva. Sin historial, los cruces por matrícula
-- (chequeoExpedientes, expedientes, expedienteDocs) reportarían falsos
-- "factura sin carpeta" / "carpeta sin factura".
--
-- Tabla en vez de columna `matricula_anterior`: un coche puede cambiar de
-- matrícula más de una vez (provisional → definitiva, re-matriculación,
-- importación) y hace falta guardar motivo/fecha de cada cambio para la
-- gestoría. Una columna suelta no admite el segundo cambio ni deja traza.
--
-- Aditiva e idempotente. matricula_norm es la misma normalización que
-- Vehiculo.matricula_norm (fix-vehiculo-identidad.sql) y normPlate() en TS.

CREATE TABLE IF NOT EXISTS vehiculo_matriculas (
  id SERIAL PRIMARY KEY,
  vehiculo_id INTEGER NOT NULL REFERENCES "Vehiculo"(id) ON DELETE CASCADE,
  matricula TEXT NOT NULL,
  matricula_norm TEXT GENERATED ALWAYS AS (
    UPPER(REGEXP_REPLACE(matricula, '[[:space:].-]', '', 'g'))
  ) STORED,
  desde DATE,
  hasta DATE,          -- NULL = vigente
  motivo TEXT,
  es_actual BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_vehiculo_matriculas_norm
  ON vehiculo_matriculas (matricula_norm);
CREATE INDEX IF NOT EXISTS idx_vehiculo_matriculas_vehiculo
  ON vehiculo_matriculas (vehiculo_id);

-- La misma matrícula no se repite dentro del mismo coche.
CREATE UNIQUE INDEX IF NOT EXISTS uq_vehiculo_matriculas_veh_norm
  ON vehiculo_matriculas (vehiculo_id, matricula_norm);

-- Una sola matrícula vigente por coche.
CREATE UNIQUE INDEX IF NOT EXISTS uq_vehiculo_matriculas_actual
  ON vehiculo_matriculas (vehiculo_id) WHERE es_actual;

-- Backfill: la matrícula actual de cada vehículo entra como fila vigente.
INSERT INTO vehiculo_matriculas (vehiculo_id, matricula, es_actual, motivo)
SELECT v.id, v.matricula, TRUE, 'backfill: matrícula al crear el historial'
  FROM "Vehiculo" v
 WHERE COALESCE(v.matricula, '') <> ''
ON CONFLICT DO NOTHING;

-- Garantía dura contra "unir dos coches distintos": una matrícula pertenece a
-- UN vehículo. Si hoy hay vehículos duplicados por matrícula (ver
-- fix-vehiculo-identidad.sql), el índice no se crea y queda el aviso: el código
-- ya ignora las matrículas ambiguas, así que la migración no falla por eso.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM vehiculo_matriculas
     GROUP BY matricula_norm HAVING COUNT(DISTINCT vehiculo_id) > 1
  ) THEN
    RAISE NOTICE 'vehiculo_matriculas: hay matrículas en más de un vehículo — se omite uq_vehiculo_matriculas_norm_global (resolvé los duplicados y volvé a correr)';
  ELSE
    CREATE UNIQUE INDEX IF NOT EXISTS uq_vehiculo_matriculas_norm_global
      ON vehiculo_matriculas (matricula_norm);
  END IF;
END $$;

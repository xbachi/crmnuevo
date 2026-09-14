-- Pasos de preparación del vehículo (checklist de las hojas). Los 6 primeros
-- pasos (CARPETA, MASTER, HOJAS A, DOCU, ITV, SEGURO) ya son columnas de
-- "Vehiculo"; aquí sólo viven los 7 que coinciden con estados del kanban.
-- fuente='import' conserva el texto original de la hoja. Idempotente.
CREATE TABLE IF NOT EXISTS vehiculo_pasos (
  id          SERIAL PRIMARY KEY,
  vehiculo_id INTEGER NOT NULL REFERENCES "Vehiculo"(id) ON DELETE CASCADE,
  paso        TEXT NOT NULL CHECK (paso IN
    ('REVI_INIC','MECAUTO','REVI_PINTURA','PINTURA','LIMPIEZA','FOTOS','PUBLICADO')),
  texto       TEXT,
  fecha       DATE,
  fuente      TEXT NOT NULL DEFAULT 'crm' CHECK (fuente IN ('crm','import')),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (vehiculo_id, paso)
);
CREATE INDEX IF NOT EXISTS idx_vehiculo_pasos_vehiculo ON vehiculo_pasos(vehiculo_id);

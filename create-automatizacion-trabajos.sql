-- Cola de trabajos que el CRM encola y la PC del dueño ejecuta (vigilar.py
-- corre publicar.py / luna.py sobre un coche). La PC los pide por
-- POST /api/automatizaciones/worker/reclamar y devuelve el resultado por
-- /worker/resultado (X-Worker-Secret). Lógica en src/lib/automatizaciones.ts.
-- Idempotente.
CREATE TABLE IF NOT EXISTS automatizacion_trabajos (
  id             SERIAL PRIMARY KEY,
  vehiculo_id    INTEGER REFERENCES "Vehiculo"(id) ON DELETE SET NULL,
  referencia     TEXT,                 -- copia al encolar ('#1088', '#D-28')
  matricula      TEXT,                 -- copia normalizada al encolar (matricula_norm)
  tipo           TEXT NOT NULL CHECK (tipo IN ('cambio_precio', 'cambio_fotos', 'publicar_borrador', 'bajar_ficha', 'carteles')),
  modo           TEXT NOT NULL CHECK (modo IN ('simular', 'aplicar')),
  -- Aplicar cambio_precio/cambio_fotos/publicar_borrador exige una simulación
  -- ok del mismo coche y tipo terminada hace < 30 min.
  simulacion_id  INTEGER REFERENCES automatizacion_trabajos(id) ON DELETE SET NULL,
  estado         TEXT NOT NULL DEFAULT 'pendiente'
                 CHECK (estado IN ('pendiente', 'en_curso', 'ok', 'error', 'caducado', 'cancelado')),
  rc             INTEGER,
  salida         TEXT,                 -- últimos <= 100 KB de la consola
  para_verificar JSONB,                -- array de líneas a revisar a mano
  url            TEXT,
  creado_por     INTEGER,              -- users.id (uid de la sesión)
  worker         TEXT,                 -- nombre de la PC que lo tomó
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expira_at      TIMESTAMPTZ NOT NULL DEFAULT NOW() + INTERVAL '15 minutes',
  started_at     TIMESTAMPTZ,
  finished_at    TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_automatizacion_trabajos_estado
  ON automatizacion_trabajos(estado, id);
CREATE INDEX IF NOT EXISTS idx_automatizacion_trabajos_vehiculo
  ON automatizacion_trabajos(vehiculo_id, created_at DESC);
-- Un doble click no encola dos veces: un solo trabajo activo por coche y tipo.
CREATE UNIQUE INDEX IF NOT EXISTS uq_automatizacion_trabajos_activo
  ON automatizacion_trabajos(vehiculo_id, tipo)
  WHERE estado IN ('pendiente', 'en_curso');

-- Latido de cada PC (la pantalla del coche muestra si está encendida).
CREATE TABLE IF NOT EXISTS automatizacion_workers (
  nombre     TEXT PRIMARY KEY,
  last_seen  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  version    TEXT
);

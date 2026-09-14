-- Fichas técnicas (tarjeta ITV) extraídas de las carpetas de OneDrive.
--
-- POR QUÉ: los datos del coche en el CRM y en la web se escriben a mano al dar
-- de alta el vehículo, y la única fuente fiable de la verdad —la ficha técnica—
-- vive como foto dentro de la carpeta del coche, que Vercel no puede leer. Un
-- script externo (otro server) lee la foto con IA y POSTea la extracción a
-- POST /api/fichas-tecnicas/snapshot; el cron /api/cron/fichas-tecnicas la cruza
-- contra el CRM y contra WordPress cada mañana.
--
-- Decisiones:
--  · vehiculo_id es NULLABLE y ON DELETE SET NULL: la carpeta puede no casar con
--    ningún vehículo (carpeta vieja, matrícula mal escrita) y la extracción no se
--    pierde por eso — queda huérfana y se vuelve a resolver si aparece el coche.
--  · matricula_norm es GENERATED con la MISMA expresión que Vehiculo.matricula_norm
--    (fix-vehiculo-identidad.sql) para que los cruces por matrícula sean idénticos
--    en los dos lados. REGEXP_REPLACE con args constantes es IMMUTABLE → apto para
--    columna generada.
--  · UNIQUE (matricula_norm, hash): la misma foto re-escaneada cada día entra una
--    sola vez (el script reenvía el snapshot completo). Cambiar la foto → hash
--    nuevo → fila nueva, y el cron vuelve a avisar de lo que siga sin cuadrar.
--  · campos JSONB: el contrato de extracción va a crecer (más campos de la ITV) y
--    no queremos una migración por campo. Cada entrada es {valor, confianza}.
--
-- Aditiva e idempotente. No toca ninguna tabla existente.

CREATE TABLE IF NOT EXISTS fichas_tecnicas (
  id                SERIAL PRIMARY KEY,
  vehiculo_id       INTEGER REFERENCES "Vehiculo"(id) ON DELETE SET NULL,
  referencia        TEXT,                    -- nº de carpeta ("1234"), informativo
  matricula_carpeta TEXT,                    -- matrícula leída del nombre de carpeta
  matricula_norm    TEXT GENERATED ALWAYS AS (
                      UPPER(REGEXP_REPLACE(COALESCE(matricula_carpeta, ''), '[[:space:].-]', '', 'g'))
                    ) STORED,
  carpeta           TEXT,
  archivo           TEXT,
  hash              TEXT NOT NULL,           -- md5 del fichero leído
  campos            JSONB NOT NULL DEFAULT '{}',
  notas             TEXT,                    -- texto libre del extractor (legibilidad)
  modelo_ia         TEXT,
  extraido_at       TIMESTAMPTZ,
  recibido_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Clave de dedup del snapshot (ON CONFLICT del endpoint). Índice, no constraint,
-- para poder crearlo con IF NOT EXISTS sin romper la idempotencia del archivo.
CREATE UNIQUE INDEX IF NOT EXISTS uq_fichas_tecnicas_matricula_hash
  ON fichas_tecnicas (matricula_norm, hash);

-- El cron busca "la ficha más reciente de este coche" una vez por vehículo.
CREATE INDEX IF NOT EXISTS ix_fichas_tecnicas_vehiculo
  ON fichas_tecnicas (vehiculo_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- Auditoría de las correcciones automáticas.
--
-- POR QUÉ: el cron corrige solo campos no-identitarios y con confianza alta, pero
-- la IA puede leer mal un dato igualmente. Sin esta tabla, una corrección errónea
-- pisa el valor bueno sin dejar rastro y no hay forma de deshacerla. Con ella,
-- revertir es un UPDATE con valor_anterior.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS fichas_tecnicas_correcciones (
  id             SERIAL PRIMARY KEY,
  vehiculo_id    INTEGER REFERENCES "Vehiculo"(id) ON DELETE SET NULL,
  campo          TEXT NOT NULL,              -- nombre de columna de "Vehiculo"
  valor_anterior TEXT,
  valor_nuevo    TEXT,
  confianza      NUMERIC,
  ficha_id       INTEGER REFERENCES fichas_tecnicas(id) ON DELETE SET NULL,
  aplicada_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS ix_fichas_correcciones_vehiculo
  ON fichas_tecnicas_correcciones (vehiculo_id, aplicada_at DESC);

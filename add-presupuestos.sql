-- Presupuestos premium: tarifas de financiación, parámetros, numeración propia
-- (P-AAAA-NNNN, independiente de next_number de facturas) y presupuestos.
-- Idempotente. Sin triggers (patrón del repo): updated_at lo mantiene la app.

CREATE TABLE IF NOT EXISTS tarifas_financiacion (
  id             SERIAL PRIMARY KEY,
  nombre         TEXT NOT NULL UNIQUE,
  entidad        TEXT,
  tin            NUMERIC(6,3),
  vigente_desde  DATE,
  vigente_hasta  DATE,
  coeficientes   JSONB NOT NULL DEFAULT '{}'::jsonb,
  activa         BOOLEAN NOT NULL DEFAULT false,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
-- Como mucho una activa.
CREATE UNIQUE INDEX IF NOT EXISTS ux_tarifas_financiacion_activa
  ON tarifas_financiacion (activa) WHERE activa;

INSERT INTO tarifas_financiacion (nombre, entidad, tin, vigente_desde, coeficientes, activa) VALUES
  ('8,99 ATENEA sept-2026', 'ATENEA', 8.99, '2026-09-01',
   '{"120":0.014760,"108":0.015500,"96":0.016501,"84":0.017863,"72":0.019758,"60":0.022494,"48":0.026691,"36":0.033799}'::jsonb,
   true),
  ('9,99 DIC-2022', NULL, 9.99, '2022-12-01',
   '{"120":0.0151,"108":0.0160,"96":0.0171,"84":0.0186,"72":0.0210,"60":0.0240,"48":0.0280,"36":0.0350,"24":0.0500}'::jsonb,
   false)
ON CONFLICT (nombre) DO NOTHING;

CREATE TABLE IF NOT EXISTS presupuesto_parametros (
  clave        TEXT PRIMARY KEY,
  valor        JSONB NOT NULL,
  descripcion  TEXT,
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO presupuesto_parametros (clave, valor, descripcion) VALUES
  ('gestion',                    '390',   'Gestión y preparación (€)'),
  ('tope_dto_base',              '20000', 'Base máxima sobre la que se aplica el % de dto por financiar'),
  ('pct_normal',                 '0.07',  '% dto tarifa NORMAL'),
  ('pct_especial',               '0.03',  '% dto tarifa ESPECIAL'),
  ('gp_bandas',                  '[[10000,490],[15000,590],[20000,690],[30000,790],[null,990]]', 'GP por defecto si la ficha no lo tiene: [limite exclusivo, importe]'),
  ('extension_umbral',           '20000', 'Contado por debajo del cual la extensión vale el precio bajo'),
  ('extension_precio_bajo',      '690',   'Extensión garantía premium (contado < umbral)'),
  ('extension_precio_alto',      '890',   'Extensión garantía premium (contado >= umbral)'),
  ('validez_dias',               '7',     'Días de validez del presupuesto'),
  ('plazo_max_meses',            '180',   'Edad máx. (meses) del coche al final del préstamo'),
  ('plazo_corto_max',            '60',    'Plazo máximo del modo PLAZO CORTO'),
  ('sustitucion_edad_max_meses', '83',    'Vehículo de sustitución si edad < N meses'),
  ('extension_min_meses',        '6',     'Meses mínimos de garantía oficial restante para ofrecer extensión'),
  ('reserva_url_defecto',        '"https://www.sevencars.es"', 'URL del botón Reservar si la ficha no tiene url_qr válida'),
  ('ratio_aviso',                '0.7',   'Aviso FINANCIA MÁS 70% si total/(contado-dto+gestión) supera esto'),
  ('whatsapp_empresa',           '""',    'Teléfono WhatsApp de la empresa para la página pública (vacío = sin botón)')
ON CONFLICT (clave) DO NOTHING;

-- Columna SIN premium con la tabla 9,99 (reproduce la hoja). Subselect: vale en cualquier DB.
INSERT INTO presupuesto_parametros (clave, valor, descripcion)
SELECT 'tarifa_sin_premium_id', to_jsonb(id), 'Tarifa de la columna SIN premium (null = misma que la activa)'
  FROM tarifas_financiacion WHERE nombre = '9,99 DIC-2022'
ON CONFLICT (clave) DO NOTHING;

CREATE TABLE IF NOT EXISTS presupuesto_numeracion (
  anio    INTEGER PRIMARY KEY,
  ultimo  INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS presupuestos (
  id                    SERIAL PRIMARY KEY,
  numero                TEXT NOT NULL UNIQUE,
  vehiculo_id           INTEGER NOT NULL REFERENCES "Vehiculo"(id),
  interesado_id         INTEGER,
  cliente_id            INTEGER REFERENCES "Cliente"(id) ON DELETE SET NULL,
  nombre_cliente        TEXT NOT NULL,
  telefono              TEXT,
  email                 TEXT,
  opciones              JSONB NOT NULL,
  calculo               JSONB NOT NULL,
  tarifa_id             INTEGER REFERENCES tarifas_financiacion(id),
  tarifa_sin_premium_id INTEGER REFERENCES tarifas_financiacion(id),
  version_parametros    JSONB NOT NULL,
  pdf_url               TEXT,
  token_publico         TEXT NOT NULL UNIQUE,
  estado                TEXT NOT NULL DEFAULT 'borrador'
                        CHECK (estado IN ('borrador','enviado','visto','aceptado','vencido','anulado')),
  valido_hasta          DATE NOT NULL,
  visto_at              TIMESTAMPTZ,
  aceptado_at           TIMESTAMPTZ,
  enviado_at            TIMESTAMPTZ,
  deal_id               INTEGER,
  creado_por            TEXT,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_presupuestos_vehiculo ON presupuestos (vehiculo_id);
CREATE INDEX IF NOT EXISTS idx_presupuestos_estado   ON presupuestos (estado);
CREATE INDEX IF NOT EXISTS idx_presupuestos_token    ON presupuestos (token_publico);

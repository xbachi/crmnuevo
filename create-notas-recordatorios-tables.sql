-- Notas y recordatorios de deals, vehículos, inversores, depósitos e
-- interesados. En producción las crearon las rutas /api/admin/create-*-table
-- (mismo DDL, misma capitalización: las tablas sin comillas quedan en
-- minúscula en Postgres). Este archivo permite levantar una base vacía.
-- Idempotente.

CREATE TABLE IF NOT EXISTS DealNotas (
  id SERIAL PRIMARY KEY,
  deal_id INTEGER NOT NULL REFERENCES "Deal"(id) ON DELETE CASCADE,
  contenido TEXT NOT NULL,
  usuario_nombre VARCHAR(255),
  fecha_creacion TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_dealnotas_deal_id ON DealNotas (deal_id);
CREATE INDEX IF NOT EXISTS idx_dealnotas_fecha_creacion ON DealNotas (fecha_creacion);

-- Sin comillas (dealrecordatorios): así la consultan /api/deals/[id]/recordatorios
-- y los agregadores. En producción coexiste con "DealRecordatorios" (camelCase,
-- creada por /api/admin/create-recordatorios-tables e indexada por
-- add-indexes-deals-vehiculos.sql); se crea también para que esa migración aplique.
CREATE TABLE IF NOT EXISTS DealRecordatorios (
  id SERIAL PRIMARY KEY,
  deal_id INTEGER NOT NULL REFERENCES "Deal"(id) ON DELETE CASCADE,
  titulo VARCHAR(255) NOT NULL,
  descripcion TEXT,
  tipo VARCHAR(50) DEFAULT 'general',
  prioridad VARCHAR(20) DEFAULT 'media',
  fecha_recordatorio TIMESTAMP NOT NULL,
  completado BOOLEAN DEFAULT false,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS "DealRecordatorios" (
  id SERIAL PRIMARY KEY,
  deal_id INTEGER NOT NULL REFERENCES "Deal"(id) ON DELETE CASCADE,
  titulo VARCHAR(255) NOT NULL,
  descripcion TEXT,
  tipo VARCHAR(50) DEFAULT 'general',
  prioridad VARCHAR(20) DEFAULT 'media',
  fecha_recordatorio TIMESTAMP NOT NULL,
  completado BOOLEAN DEFAULT false,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS "VehiculoRecordatorios" (
  id SERIAL PRIMARY KEY,
  vehiculo_id INTEGER NOT NULL REFERENCES "Vehiculo"(id) ON DELETE CASCADE,
  titulo VARCHAR(255) NOT NULL,
  descripcion TEXT,
  tipo VARCHAR(50) DEFAULT 'general',
  prioridad VARCHAR(20) DEFAULT 'media',
  fecha_recordatorio TIMESTAMP NOT NULL,
  completado BOOLEAN DEFAULT false,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS "InversorRecordatorios" (
  id SERIAL PRIMARY KEY,
  inversor_id INTEGER NOT NULL REFERENCES "Inversor"(id) ON DELETE CASCADE,
  titulo VARCHAR(255) NOT NULL,
  descripcion TEXT,
  tipo VARCHAR(50) DEFAULT 'general',
  prioridad VARCHAR(20) DEFAULT 'media',
  fecha_recordatorio TIMESTAMP NOT NULL,
  completado BOOLEAN DEFAULT false,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS InversorNotas (
  id SERIAL PRIMARY KEY,
  inversor_id INTEGER NOT NULL REFERENCES "Inversor"(id) ON DELETE CASCADE,
  contenido TEXT NOT NULL,
  usuario_nombre VARCHAR(255),
  fecha_creacion TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_inversornotas_inversor_id ON InversorNotas (inversor_id);
CREATE INDEX IF NOT EXISTS idx_inversornotas_fecha_creacion ON InversorNotas (fecha_creacion);

-- Con comillas: así la consultan /api/depositos/[id]/recordatorios y los agregadores.
CREATE TABLE IF NOT EXISTS "DepositoRecordatorios" (
  id SERIAL PRIMARY KEY,
  deposito_id INTEGER NOT NULL REFERENCES depositos(id) ON DELETE CASCADE,
  titulo VARCHAR(255) NOT NULL,
  descripcion TEXT,
  tipo VARCHAR(50) DEFAULT 'general',
  prioridad VARCHAR(20) DEFAULT 'media',
  fecha_recordatorio TIMESTAMP NOT NULL,
  completado BOOLEAN DEFAULT false,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_deposito_recordatorio_deposito_id ON "DepositoRecordatorios"(deposito_id);
CREATE INDEX IF NOT EXISTS idx_deposito_recordatorio_fecha ON "DepositoRecordatorios"(fecha_recordatorio);

-- Recordatorios manuales (/api/recordatorios/manuales y depósitos).
CREATE TABLE IF NOT EXISTS "Recordatorio" (
  id SERIAL PRIMARY KEY,
  "clienteId" INTEGER REFERENCES "Cliente"(id) ON DELETE CASCADE,
  "vehiculoId" INTEGER REFERENCES "Vehiculo"(id) ON DELETE CASCADE,
  "depositoId" INTEGER REFERENCES depositos(id) ON DELETE CASCADE,
  titulo VARCHAR(255) NOT NULL,
  descripcion TEXT,
  tipo VARCHAR(50) DEFAULT 'general',
  prioridad VARCHAR(20) DEFAULT 'media',
  fecha TIMESTAMP,
  completado BOOLEAN DEFAULT false,
  "createdAt" TIMESTAMP DEFAULT NOW(),
  "updatedAt" TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS "NotaInteresado" (
  id SERIAL PRIMARY KEY,
  "interesadoId" INTEGER NOT NULL REFERENCES interesados(id) ON DELETE CASCADE,
  tipo VARCHAR(50) DEFAULT 'general',
  titulo VARCHAR(200),
  contenido TEXT NOT NULL,
  prioridad VARCHAR(20) DEFAULT 'normal',
  usuario VARCHAR(100) DEFAULT 'Sistema',
  fecha TIMESTAMP DEFAULT NOW(),
  "createdAt" TIMESTAMP DEFAULT NOW(),
  "updatedAt" TIMESTAMP DEFAULT NOW()
);

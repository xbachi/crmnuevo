-- Columnas del modelo (docs/schema.prisma) que create-tables.sql no declara.
-- En producción ya existen (las creó Prisma); aquí se añaden para poder
-- levantar una base vacía con el esquema que usa la app. Idempotente.
ALTER TABLE "Cliente"
  ADD COLUMN IF NOT EXISTS "kilometrajeMaximo"     INTEGER,
  ADD COLUMN IF NOT EXISTS "añoMinimo"             INTEGER,
  ADD COLUMN IF NOT EXISTS "combustiblePreferido"  TEXT DEFAULT 'cualquiera',
  ADD COLUMN IF NOT EXISTS "cambioPreferido"       TEXT DEFAULT 'cualquiera',
  ADD COLUMN IF NOT EXISTS "coloresDeseados"       TEXT,
  ADD COLUMN IF NOT EXISTS "necesidadesEspeciales" TEXT,
  ADD COLUMN IF NOT EXISTS "formaPagoPreferida"    TEXT DEFAULT 'cualquiera',
  ADD COLUMN IF NOT EXISTS "comoLlego"             TEXT,
  ADD COLUMN IF NOT EXISTS "fechaPrimerContacto"   TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "estado"                TEXT DEFAULT 'nuevo',
  ADD COLUMN IF NOT EXISTS "prioridad"             TEXT DEFAULT 'media',
  ADD COLUMN IF NOT EXISTS "proximoPaso"           TEXT,
  ADD COLUMN IF NOT EXISTS "etiquetas"             TEXT,
  ADD COLUMN IF NOT EXISTS "notasAdicionales"      TEXT;

ALTER TABLE "Vehiculo"
  ADD COLUMN IF NOT EXISTS "pagado"               BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS "transporteSolicitado" BOOLEAN DEFAULT false;

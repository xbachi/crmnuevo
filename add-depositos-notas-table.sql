-- Crear tabla para notas de depósitos (similar a NotaCliente)
CREATE TABLE IF NOT EXISTS "NotaDeposito" (
  id SERIAL PRIMARY KEY,
  "depositoId" INTEGER NOT NULL REFERENCES depositos(id) ON DELETE CASCADE,
  tipo VARCHAR(50) DEFAULT 'general',
  titulo VARCHAR(255),
  contenido TEXT NOT NULL,
  prioridad VARCHAR(20) DEFAULT 'normal',
  completada BOOLEAN DEFAULT FALSE,
  fecha TIMESTAMP DEFAULT NOW(),
  usuario VARCHAR(100) DEFAULT 'Sistema',
  "createdAt" TIMESTAMP DEFAULT NOW(),
  "updatedAt" TIMESTAMP DEFAULT NOW()
);

-- Crear índice para mejorar performance
CREATE INDEX IF NOT EXISTS "NotaDeposito_depositoId_idx" ON "NotaDeposito"("depositoId");
CREATE INDEX IF NOT EXISTS "NotaDeposito_fecha_idx" ON "NotaDeposito"(fecha DESC);

-- Comentarios para documentar la tabla
COMMENT ON TABLE "NotaDeposito" IS 'Notas acumulativas para depósitos con historial y trazabilidad';
COMMENT ON COLUMN "NotaDeposito"."depositoId" IS 'ID del depósito al que pertenece la nota';
COMMENT ON COLUMN "NotaDeposito".tipo IS 'Tipo de nota: general, llamada, visita, etc.';
COMMENT ON COLUMN "NotaDeposito".contenido IS 'Contenido principal de la nota';
COMMENT ON COLUMN "NotaDeposito".usuario IS 'Usuario que creó la nota';
COMMENT ON COLUMN "NotaDeposito".fecha IS 'Fecha y hora de la nota';

-- Quitar el campo notas de la tabla depositos ya que ahora usaremos NotaDeposito
-- ALTER TABLE depositos DROP COLUMN IF EXISTS notas;

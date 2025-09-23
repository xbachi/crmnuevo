-- Agregar campos de autenticación a la tabla Inversor
ALTER TABLE "Inversor" 
ADD COLUMN IF NOT EXISTS usuario VARCHAR(255),
ADD COLUMN IF NOT EXISTS contraseña VARCHAR(255);

-- Crear índice único para el campo usuario
CREATE UNIQUE INDEX IF NOT EXISTS idx_inversor_usuario ON "Inversor" (usuario) WHERE usuario IS NOT NULL;

-- Comentarios para documentar los nuevos campos
COMMENT ON COLUMN "Inversor".usuario IS 'Usuario para acceso del inversor a su página personal';
COMMENT ON COLUMN "Inversor".contraseña IS 'Contraseña para acceso del inversor a su página personal';

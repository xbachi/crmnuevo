-- Script para agregar columnas faltantes en la tabla Vehiculo
-- Ejecutar este script en la consola SQL de Supabase

-- Agregar columna color si no existe
ALTER TABLE "Vehiculo" 
ADD COLUMN IF NOT EXISTS color VARCHAR(50);

-- Agregar columna fechaMatriculacion si no existe  
ALTER TABLE "Vehiculo"
ADD COLUMN IF NOT EXISTS "fechaMatriculacion" DATE;

-- Verificar que las columnas se agregaron correctamente
SELECT column_name, data_type, is_nullable 
FROM information_schema.columns 
WHERE table_name = 'Vehiculo' 
AND column_name IN ('color', 'fechaMatriculacion')
ORDER BY column_name;

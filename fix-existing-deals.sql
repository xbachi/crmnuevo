-- Script para arreglar deals existentes sin estado
-- Ejecutar en la base de datos PostgreSQL

-- Actualizar deals que no tienen estado
UPDATE "Deal" 
SET estado = 'nuevo' 
WHERE estado IS NULL;

-- Verificar que los deals tengan estado
SELECT id, numero, estado, "createdAt" 
FROM "Deal" 
ORDER BY "createdAt" DESC;

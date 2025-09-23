-- Agregar campos de timestamp individuales para acciones de cambio de nombre
ALTER TABLE "Deal" 
ADD COLUMN IF NOT EXISTS cambio_nombre_solicitado_at TIMESTAMP,
ADD COLUMN IF NOT EXISTS documentacion_recibida_at TIMESTAMP,
ADD COLUMN IF NOT EXISTS documentacion_retirada_at TIMESTAMP,
ADD COLUMN IF NOT EXISTS cliente_avisado_at TIMESTAMP;

-- Actualizar los timestamps existentes basándose en updatedAt
UPDATE "Deal" 
SET cambio_nombre_solicitado_at = updated_at
WHERE cambio_nombre_solicitado = true 
AND cambio_nombre_solicitado_at IS NULL;

UPDATE "Deal" 
SET documentacion_recibida_at = updated_at
WHERE documentacion_recibida = true 
AND documentacion_recibida_at IS NULL;

UPDATE "Deal" 
SET documentacion_retirada_at = updated_at
WHERE documentacion_retirada = true 
AND documentacion_retirada_at IS NULL;

UPDATE "Deal" 
SET cliente_avisado_at = updated_at
WHERE cliente_avisado = true 
AND cliente_avisado_at IS NULL;

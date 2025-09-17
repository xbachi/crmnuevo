-- Agregar campo para rastrear si el contrato de depósito ha sido generado
ALTER TABLE depositos 
ADD COLUMN IF NOT EXISTS contrato_generado BOOLEAN DEFAULT FALSE;

-- Agregar campo para rastrear si el contrato de compra ha sido generado
ALTER TABLE depositos 
ADD COLUMN IF NOT EXISTS contrato_compra_generado BOOLEAN DEFAULT FALSE;

-- Actualizar el estado CHECK para incluir VENDIDO
ALTER TABLE depositos 
DROP CONSTRAINT IF EXISTS depositos_estado_check;

ALTER TABLE depositos 
ADD CONSTRAINT depositos_estado_check 
CHECK (estado IN ('BORRADOR', 'ACTIVO', 'FINALIZADO', 'VENDIDO'));

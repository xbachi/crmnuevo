-- Agregar campos faltantes a la tabla depositos
-- Estos campos son necesarios para que funcione igual que deals

-- 1. Agregar campos de contratos (como deals tiene contratoReserva, contratoVenta)
ALTER TABLE depositos 
ADD COLUMN IF NOT EXISTS contrato_deposito TEXT;

ALTER TABLE depositos 
ADD COLUMN IF NOT EXISTS contrato_compra TEXT;

-- 2. Agregar campo observaciones (como deals)
ALTER TABLE depositos 
ADD COLUMN IF NOT EXISTS observaciones TEXT;

-- 3. Actualizar constraint de estado para incluir VENDIDO
ALTER TABLE depositos 
DROP CONSTRAINT IF EXISTS depositos_estado_check;

ALTER TABLE depositos 
ADD CONSTRAINT depositos_estado_check 
CHECK (estado IN ('BORRADOR', 'ACTIVO', 'FINALIZADO', 'VENDIDO'));

-- 4. Agregar campos adicionales que podrían ser útiles (como deals)
ALTER TABLE depositos 
ADD COLUMN IF NOT EXISTS monto_recibir DECIMAL(10,2);

ALTER TABLE depositos 
ADD COLUMN IF NOT EXISTS dias_gestion INTEGER DEFAULT 90;

ALTER TABLE depositos 
ADD COLUMN IF NOT EXISTS multa_retiro_anticipado DECIMAL(10,2);

ALTER TABLE depositos 
ADD COLUMN IF NOT EXISTS numero_cuenta TEXT;

-- Comentarios para documentar los campos
COMMENT ON COLUMN depositos.contrato_deposito IS 'Nombre del archivo PDF del contrato de depósito generado';
COMMENT ON COLUMN depositos.contrato_compra IS 'Nombre del archivo PDF del contrato de compra generado';
COMMENT ON COLUMN depositos.notas IS 'Notas internas del depósito';
COMMENT ON COLUMN depositos.observaciones IS 'Observaciones adicionales del depósito';
COMMENT ON COLUMN depositos.monto_recibir IS 'Monto que recibirá el propietario del vehículo';
COMMENT ON COLUMN depositos.dias_gestion IS 'Días de gestión acordados (por defecto 90)';
COMMENT ON COLUMN depositos.multa_retiro_anticipado IS 'Multa por retiro anticipado del vehículo';
COMMENT ON COLUMN depositos.numero_cuenta IS 'Número de cuenta para el pago';

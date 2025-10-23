-- Agregar campo tipo_vehiculo a la tabla Vehiculo
ALTER TABLE "Vehiculo" ADD COLUMN tipo_vehiculo VARCHAR(20) DEFAULT 'normal';

-- Actualizar vehículos existentes para que sean tipo 'normal'
UPDATE "Vehiculo" SET tipo_vehiculo = 'normal' WHERE tipo_vehiculo IS NULL;

-- Crear índice para mejorar consultas por tipo
CREATE INDEX idx_vehiculo_tipo ON "Vehiculo"(tipo_vehiculo);

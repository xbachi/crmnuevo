-- Script para crear índices en la base de datos
-- Mejora el rendimiento de consultas frecuentes

-- Índices para la tabla Vehiculo
CREATE INDEX IF NOT EXISTS idx_vehiculo_inversor_id ON "Vehiculo"("inversorId");
CREATE INDEX IF NOT EXISTS idx_vehiculo_estado ON "Vehiculo"(estado);
CREATE INDEX IF NOT EXISTS idx_vehiculo_tipo ON "Vehiculo"(tipo);
CREATE INDEX IF NOT EXISTS idx_vehiculo_estado_tipo ON "Vehiculo"(estado, tipo);
CREATE INDEX IF NOT EXISTS idx_vehiculo_es_coche_inversor ON "Vehiculo"("esCocheInversor");

-- Índices para la tabla Deal
CREATE INDEX IF NOT EXISTS idx_deal_vehiculo_id ON "Deal"("vehiculoId");
CREATE INDEX IF NOT EXISTS idx_deal_cliente_id ON "Deal"("clienteId");
CREATE INDEX IF NOT EXISTS idx_deal_estado ON "Deal"(estado);
CREATE INDEX IF NOT EXISTS idx_deal_created_at ON "Deal"("createdAt");

-- Índices para la tabla Cliente
CREATE INDEX IF NOT EXISTS idx_cliente_dni ON "Cliente"(dni);
CREATE INDEX IF NOT EXISTS idx_cliente_email ON "Cliente"(email);

-- Índices para la tabla Inversor
CREATE INDEX IF NOT EXISTS idx_inversor_email ON "Inversor"(email);

-- Comentarios sobre los índices
COMMENT ON INDEX idx_vehiculo_inversor_id IS 'Índice para filtrar vehículos por inversor';
COMMENT ON INDEX idx_vehiculo_estado IS 'Índice para filtrar vehículos por estado';
COMMENT ON INDEX idx_vehiculo_tipo IS 'Índice para filtrar vehículos por tipo';
COMMENT ON INDEX idx_vehiculo_estado_tipo IS 'Índice compuesto para filtrar por estado y tipo';
COMMENT ON INDEX idx_deal_vehiculo_id IS 'Índice para buscar deals por vehículo';
COMMENT ON INDEX idx_deal_cliente_id IS 'Índice para buscar deals por cliente';


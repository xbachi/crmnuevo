-- Script para agregar índices de base de datos para mejorar el rendimiento
-- Ejecutar este script en la base de datos PostgreSQL

-- Índices para la tabla Deal
CREATE INDEX IF NOT EXISTS idx_deal_cliente_id ON "Deal"("clienteId");
CREATE INDEX IF NOT EXISTS idx_deal_vehiculo_id ON "Deal"("vehiculoId");
CREATE INDEX IF NOT EXISTS idx_deal_created_at ON "Deal"("createdAt");
CREATE INDEX IF NOT EXISTS idx_deal_estado ON "Deal"("estado");
CREATE INDEX IF NOT EXISTS idx_deal_numero ON "Deal"("numero");

-- Índices para la tabla Cliente
CREATE INDEX IF NOT EXISTS idx_cliente_nombre ON "Cliente"("nombre");
CREATE INDEX IF NOT EXISTS idx_cliente_apellidos ON "Cliente"("apellidos");
CREATE INDEX IF NOT EXISTS idx_cliente_telefono ON "Cliente"("telefono");
CREATE INDEX IF NOT EXISTS idx_cliente_email ON "Cliente"("email");
CREATE INDEX IF NOT EXISTS idx_cliente_dni ON "Cliente"("dni");
CREATE INDEX IF NOT EXISTS idx_cliente_estado ON "Cliente"("estado");
CREATE INDEX IF NOT EXISTS idx_cliente_created_at ON "Cliente"("createdAt");

-- Índices para la tabla Vehiculo
CREATE INDEX IF NOT EXISTS idx_vehiculo_referencia ON "Vehiculo"("referencia");
CREATE INDEX IF NOT EXISTS idx_vehiculo_marca ON "Vehiculo"("marca");
CREATE INDEX IF NOT EXISTS idx_vehiculo_modelo ON "Vehiculo"("modelo");
CREATE INDEX IF NOT EXISTS idx_vehiculo_matricula ON "Vehiculo"("matricula");
CREATE INDEX IF NOT EXISTS idx_vehiculo_bastidor ON "Vehiculo"("bastidor");
CREATE INDEX IF NOT EXISTS idx_vehiculo_tipo ON "Vehiculo"("tipo");
CREATE INDEX IF NOT EXISTS idx_vehiculo_estado ON "Vehiculo"("estado");
CREATE INDEX IF NOT EXISTS idx_vehiculo_inversor_id ON "Vehiculo"("inversorId");
CREATE INDEX IF NOT EXISTS idx_vehiculo_created_at ON "Vehiculo"("createdAt");

-- Índices compuestos para consultas frecuentes
CREATE INDEX IF NOT EXISTS idx_vehiculo_tipo_estado ON "Vehiculo"("tipo", "estado");
CREATE INDEX IF NOT EXISTS idx_vehiculo_marca_modelo ON "Vehiculo"("marca", "modelo");
CREATE INDEX IF NOT EXISTS idx_deal_estado_created_at ON "Deal"("estado", "createdAt");

-- Índices para búsquedas de texto (usando GIN para búsquedas más rápidas)
-- Nota: Estos requieren la extensión pg_trgm
-- CREATE EXTENSION IF NOT EXISTS pg_trgm;
-- CREATE INDEX IF NOT EXISTS idx_vehiculo_referencia_trgm ON "Vehiculo" USING gin("referencia" gin_trgm_ops);
-- CREATE INDEX IF NOT EXISTS idx_vehiculo_marca_trgm ON "Vehiculo" USING gin("marca" gin_trgm_ops);
-- CREATE INDEX IF NOT EXISTS idx_vehiculo_modelo_trgm ON "Vehiculo" USING gin("modelo" gin_trgm_ops);
-- CREATE INDEX IF NOT EXISTS idx_cliente_nombre_trgm ON "Cliente" USING gin("nombre" gin_trgm_ops);
-- CREATE INDEX IF NOT EXISTS idx_cliente_apellidos_trgm ON "Cliente" USING gin("apellidos" gin_trgm_ops);

-- Índices para la tabla depositos
CREATE INDEX IF NOT EXISTS idx_depositos_vehiculo_id ON "depositos"("vehiculo_id");
CREATE INDEX IF NOT EXISTS idx_depositos_estado ON "depositos"("estado");
CREATE INDEX IF NOT EXISTS idx_depositos_vehiculo_estado ON "depositos"("vehiculo_id", "estado");

-- Verificar que los índices se crearon correctamente
SELECT 
    schemaname,
    tablename,
    indexname,
    indexdef
FROM pg_indexes 
WHERE tablename IN ('Deal', 'Cliente', 'Vehiculo', 'depositos')
ORDER BY tablename, indexname;

-- Script para optimizar el rendimiento de la base de datos
-- Agregar índices críticos para mejorar tiempos de consulta

-- Índices para la tabla Deal
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_deal_cliente_id ON "Deal"("clienteId");
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_deal_vehiculo_id ON "Deal"("vehiculoId");
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_deal_created_at ON "Deal"("createdAt" DESC);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_deal_estado ON "Deal"("estado");

-- Índices para la tabla Cliente
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_cliente_id ON "Cliente"("id");
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_cliente_nombre ON "Cliente"("nombre");
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_cliente_apellidos ON "Cliente"("apellidos");
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_cliente_email ON "Cliente"("email");
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_cliente_telefono ON "Cliente"("telefono");
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_cliente_dni ON "Cliente"("dni");

-- Índices para la tabla Vehiculo
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_vehiculo_id ON "Vehiculo"("id");
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_vehiculo_referencia ON "Vehiculo"("referencia");
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_vehiculo_marca ON "Vehiculo"("marca");
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_vehiculo_modelo ON "Vehiculo"("modelo");
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_vehiculo_matricula ON "Vehiculo"("matricula");
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_vehiculo_estado ON "Vehiculo"("estado");
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_vehiculo_tipo ON "Vehiculo"("tipo");
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_vehiculo_inversor_id ON "Vehiculo"("inversorId");

-- Índices compuestos para consultas frecuentes
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_vehiculo_estado_tipo ON "Vehiculo"("estado", "tipo");
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_vehiculo_busqueda ON "Vehiculo" USING gin(
  to_tsvector('spanish', 
    COALESCE("referencia", '') || ' ' || 
    COALESCE("marca", '') || ' ' || 
    COALESCE("modelo", '') || ' ' || 
    COALESCE("matricula", '') || ' ' || 
    COALESCE("bastidor", '')
  )
);

-- Índices para la tabla Deposito
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_deposito_cliente_id ON "depositos"("clienteId");
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_deposito_vehiculo_id ON "depositos"("vehiculoId");
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_deposito_estado ON "depositos"("estado");
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_deposito_created_at ON "depositos"("createdAt" DESC);

-- Índices para la tabla Inversor
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_inversor_id ON "Inversor"("id");
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_inversor_email ON "Inversor"("email");

-- Índices para la tabla Recordatorio
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_recordatorio_deal_id ON "Recordatorio"("dealId");
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_recordatorio_vehiculo_id ON "Recordatorio"("vehiculoId");
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_recordatorio_cliente_id ON "Recordatorio"("clienteId");
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_recordatorio_fecha ON "Recordatorio"("fecha");

-- Índices para la tabla Nota
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_nota_deal_id ON "Nota"("dealId");
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_nota_vehiculo_id ON "Nota"("vehiculoId");
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_nota_cliente_id ON "Nota"("clienteId");
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_nota_created_at ON "Nota"("createdAt" DESC);

-- Actualizar estadísticas de la base de datos
ANALYZE "Deal";
ANALYZE "Cliente";
ANALYZE "Vehiculo";
ANALYZE "depositos";
ANALYZE "Inversor";
ANALYZE "Recordatorio";
ANALYZE "Nota";

-- Mostrar información sobre los índices creados
SELECT 
  schemaname,
  tablename,
  indexname,
  indexdef
FROM pg_indexes 
WHERE tablename IN ('Deal', 'Cliente', 'Vehiculo', 'depositos', 'Inversor', 'Recordatorio', 'Nota')
ORDER BY tablename, indexname;

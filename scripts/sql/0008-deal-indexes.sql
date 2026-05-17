-- 0008-deal-indexes.sql
-- Índices en Deal para evitar slow queries cuando crezca el volumen.
-- Las queries más frecuentes filtran por clienteId (perfil cliente), vehiculoId
-- (qué deal tiene un vehículo) y estado (lista por tab nuevo/reservado/vendido/facturado).
-- Sin índices, Postgres hace seq scan en cada query.

CREATE INDEX IF NOT EXISTS idx_deal_cliente_id ON "Deal"("clienteId");
CREATE INDEX IF NOT EXISTS idx_deal_vehiculo_id ON "Deal"("vehiculoId");
CREATE INDEX IF NOT EXISTS idx_deal_estado ON "Deal"(estado);
-- Compuesto: lista por estado + orden por creación (patrón típico del listado).
CREATE INDEX IF NOT EXISTS idx_deal_estado_created_at
  ON "Deal"(estado, "createdAt" DESC);

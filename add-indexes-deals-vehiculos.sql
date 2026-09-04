-- apply-sql: no-transaction
-- Índices que faltaban según pg_indexes/information_schema (verificado 2026-09-04).
-- CREATE INDEX CONCURRENTLY no admite transacción: el runner lo ejecuta sentencia a sentencia.
-- Ya existían y NO se duplican: Deal(clienteId, vehiculoId, createdAt, estado),
-- Cliente(createdAt), Vehiculo(createdAt), dealnotas(deal_id), dealrecordatorios(deal_id).

-- Búsqueda del listado de vehículos: LOWER(col) LIKE '%term%' (direct-database.ts,
-- buildVehiculosListQuery). Los btree existentes no sirven con comodín inicial; pg_trgm sí.
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_vehiculo_referencia_trgm
  ON "Vehiculo" USING gin (LOWER(referencia) gin_trgm_ops);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_vehiculo_marca_trgm
  ON "Vehiculo" USING gin (LOWER(marca) gin_trgm_ops);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_vehiculo_modelo_trgm
  ON "Vehiculo" USING gin (LOWER(modelo) gin_trgm_ops);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_vehiculo_matricula_trgm
  ON "Vehiculo" USING gin (LOWER(matricula) gin_trgm_ops);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_vehiculo_bastidor_trgm
  ON "Vehiculo" USING gin (LOWER(bastidor) gin_trgm_ops);

-- ORDER BY v."createdAt" DESC, v.id DESC del listado paginado (LIMIT/OFFSET).
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_vehiculo_created_at_id
  ON "Vehiculo" ("createdAt" DESC, id DESC);

-- Stats y getVentasPorMes filtran por UPPER(TRIM(estado)).
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_vehiculo_estado_upper_trim
  ON "Vehiculo" ((UPPER(TRIM(estado))));

-- ORDER BY de los listados y JOIN de recordatorios (tabla camelCase entre comillas).
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_interesados_created_at
  ON interesados ("createdAt");
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_depositos_created_at
  ON depositos (created_at);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_deal_recordatorios_deal_id
  ON "DealRecordatorios" (deal_id);

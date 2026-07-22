-- create-inversor-notificaciones.sql
--
-- Registro/dedup de avisos automáticos por email al inversor cuando un coche
-- suyo se reserva o se vende (src/lib/inversorNotify.ts). El UNIQUE garantiza
-- un solo mail por (vehículo, evento) aunque el estado cambie por varias vías.

CREATE TABLE IF NOT EXISTS inversor_notificaciones (
  id SERIAL PRIMARY KEY,
  vehiculo_id INTEGER NOT NULL,
  inversor_id INTEGER NOT NULL,
  evento TEXT NOT NULL CHECK (evento IN ('reservado', 'vendido')),
  email TEXT,
  enviado_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (vehiculo_id, evento)
);

-- Control:
--   SELECT * FROM inversor_notificaciones ORDER BY enviado_at DESC LIMIT 20;

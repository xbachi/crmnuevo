-- Tabla para notas de vehículos
CREATE TABLE IF NOT EXISTS VehiculoNotas (
  id SERIAL PRIMARY KEY,
  vehiculoId INTEGER NOT NULL,
  contenido TEXT NOT NULL,
  fecha TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  usuario VARCHAR(255) DEFAULT 'Usuario',
  tipo VARCHAR(50) DEFAULT 'general' CHECK (tipo IN ('general', 'tecnica', 'comercial', 'financiera')),
  prioridad VARCHAR(20) DEFAULT 'media' CHECK (prioridad IN ('baja', 'media', 'alta')),
  completada BOOLEAN DEFAULT false,
  createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Tabla para recordatorios de vehículos
CREATE TABLE IF NOT EXISTS VehiculoRecordatorios (
  id SERIAL PRIMARY KEY,
  vehiculoId INTEGER NOT NULL,
  titulo VARCHAR(255) NOT NULL,
  descripcion TEXT,
  fechaRecordatorio TIMESTAMP NOT NULL,
  tipo VARCHAR(50) DEFAULT 'otro' CHECK (tipo IN ('itv', 'seguro', 'revision', 'documentacion', 'otro')),
  prioridad VARCHAR(20) DEFAULT 'media' CHECK (prioridad IN ('baja', 'media', 'alta')),
  completado BOOLEAN DEFAULT false,
  createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Índices para mejorar rendimiento
CREATE INDEX IF NOT EXISTS idx_vehiculo_notas_vehiculo_id ON VehiculoNotas(vehiculoId);
CREATE INDEX IF NOT EXISTS idx_vehiculo_notas_fecha ON VehiculoNotas(fecha);
CREATE INDEX IF NOT EXISTS idx_vehiculo_notas_tipo ON VehiculoNotas(tipo);
CREATE INDEX IF NOT EXISTS idx_vehiculo_notas_prioridad ON VehiculoNotas(prioridad);

CREATE INDEX IF NOT EXISTS idx_vehiculo_recordatorios_vehiculo_id ON VehiculoRecordatorios(vehiculoId);
CREATE INDEX IF NOT EXISTS idx_vehiculo_recordatorios_fecha ON VehiculoRecordatorios(fechaRecordatorio);
CREATE INDEX IF NOT EXISTS idx_vehiculo_recordatorios_tipo ON VehiculoRecordatorios(tipo);
CREATE INDEX IF NOT EXISTS idx_vehiculo_recordatorios_completado ON VehiculoRecordatorios(completado);

-- Comentarios para documentación
COMMENT ON TABLE VehiculoNotas IS 'Tabla para almacenar notas relacionadas con vehículos';
COMMENT ON TABLE VehiculoRecordatorios IS 'Tabla para almacenar recordatorios relacionados con vehículos';

COMMENT ON COLUMN VehiculoNotas.vehiculoId IS 'ID del vehículo al que pertenece la nota';
COMMENT ON COLUMN VehiculoNotas.contenido IS 'Contenido de la nota';
COMMENT ON COLUMN VehiculoNotas.tipo IS 'Tipo de nota: general, tecnica, comercial, financiera';
COMMENT ON COLUMN VehiculoNotas.prioridad IS 'Prioridad de la nota: baja, media, alta';

COMMENT ON COLUMN VehiculoRecordatorios.vehiculoId IS 'ID del vehículo al que pertenece el recordatorio';
COMMENT ON COLUMN VehiculoRecordatorios.titulo IS 'Título del recordatorio';
COMMENT ON COLUMN VehiculoRecordatorios.descripcion IS 'Descripción detallada del recordatorio';
COMMENT ON COLUMN VehiculoRecordatorios.fechaRecordatorio IS 'Fecha y hora cuando debe activarse el recordatorio';
COMMENT ON COLUMN VehiculoRecordatorios.tipo IS 'Tipo de recordatorio: itv, seguro, revision, documentacion, otro';
COMMENT ON COLUMN VehiculoRecordatorios.prioridad IS 'Prioridad del recordatorio: baja, media, alta';
COMMENT ON COLUMN VehiculoRecordatorios.completado IS 'Indica si el recordatorio ha sido completado';

-- Datos de ejemplo (opcional)
INSERT INTO VehiculoNotas (vehiculoId, contenido, tipo, prioridad, usuario) VALUES
(1, 'Vehículo recién llegado, necesita revisión completa', 'tecnica', 'alta', 'Juan Pérez'),
(1, 'Cliente interesado, precio negociable', 'comercial', 'media', 'Ana García'),
(2, 'Documentación completa, listo para venta', 'general', 'baja', 'Carlos López')
ON CONFLICT DO NOTHING;

INSERT INTO VehiculoRecordatorios (vehiculoId, titulo, descripcion, fechaRecordatorio, tipo, prioridad) VALUES
(1, 'Renovar ITV', 'El vehículo necesita pasar la ITV antes del 15 de febrero', '2025-02-10 09:00:00', 'itv', 'alta'),
(1, 'Revisión de frenos', 'Revisar estado de las pastillas de freno', '2025-01-25 14:00:00', 'revision', 'media'),
(2, 'Renovar seguro', 'El seguro vence a final de mes', '2025-01-30 10:00:00', 'seguro', 'alta')
ON CONFLICT DO NOTHING;

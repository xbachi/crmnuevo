-- Crear tabla para documentos de vehículos
CREATE TABLE IF NOT EXISTS VehiculoDocumentos (
  id SERIAL PRIMARY KEY,
  vehiculo_id INTEGER NOT NULL,
  nombre_archivo VARCHAR(255) NOT NULL,
  nombre_original VARCHAR(255) NOT NULL,
  ruta_archivo VARCHAR(500) NOT NULL,
  tamaño_bytes BIGINT NOT NULL,
  tipo_mime VARCHAR(100),
  fecha_subida TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (vehiculo_id) REFERENCES Vehiculos(id) ON DELETE CASCADE
);

-- Crear índice para búsquedas por vehículo
CREATE INDEX IF NOT EXISTS idx_vehiculo_documentos_vehiculo_id ON VehiculoDocumentos(vehiculo_id);

-- Crear índice para búsquedas por fecha
CREATE INDEX IF NOT EXISTS idx_vehiculo_documentos_fecha ON VehiculoDocumentos(fecha_subida);

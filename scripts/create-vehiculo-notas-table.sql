-- Crear tabla para notas de vehículos
CREATE TABLE IF NOT EXISTS VehiculoNotas (
    id SERIAL PRIMARY KEY,
    vehiculo_id INTEGER NOT NULL,
    contenido TEXT NOT NULL,
    usuario_id INTEGER,
    usuario_nombre VARCHAR(255),
    fecha_creacion TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (vehiculo_id) REFERENCES "Vehiculo"(id) ON DELETE CASCADE
);

-- Crear índice para mejorar rendimiento
CREATE INDEX IF NOT EXISTS idx_vehiculonotas_vehiculo_id ON VehiculoNotas (vehiculo_id);
CREATE INDEX IF NOT EXISTS idx_vehiculonotas_fecha_creacion ON VehiculoNotas (fecha_creacion);

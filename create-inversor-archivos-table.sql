-- Crear tabla para archivos de inversores
CREATE TABLE IF NOT EXISTS "InversorArchivo" (
  id SERIAL PRIMARY KEY,
  "inversorId" INTEGER NOT NULL REFERENCES "Inversor"(id) ON DELETE CASCADE,
  nombre VARCHAR(255) NOT NULL,
  url VARCHAR(500) NOT NULL,
  tipo VARCHAR(100) NOT NULL,
  tamaño INTEGER NOT NULL,
  descripcion TEXT,
  "fechaSubida" TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  "fechaActualizacion" TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Crear índices para mejorar el rendimiento
CREATE INDEX IF NOT EXISTS idx_inversor_archivo_inversor_id ON "InversorArchivo"("inversorId");
CREATE INDEX IF NOT EXISTS idx_inversor_archivo_fecha_subida ON "InversorArchivo"("fechaSubida");

-- Comentarios para documentar la tabla
COMMENT ON TABLE "InversorArchivo" IS 'Tabla para almacenar archivos y facturas de inversores';
COMMENT ON COLUMN "InversorArchivo"."inversorId" IS 'ID del inversor propietario del archivo';
COMMENT ON COLUMN "InversorArchivo".nombre IS 'Nombre original del archivo';
COMMENT ON COLUMN "InversorArchivo".url IS 'Ruta relativa del archivo en el servidor';
COMMENT ON COLUMN "InversorArchivo".tipo IS 'Tipo MIME del archivo';
COMMENT ON COLUMN "InversorArchivo".tamaño IS 'Tamaño del archivo en bytes';
COMMENT ON COLUMN "InversorArchivo".descripcion IS 'Descripción opcional del archivo';
COMMENT ON COLUMN "InversorArchivo"."fechaSubida" IS 'Fecha y hora de subida del archivo';
COMMENT ON COLUMN "InversorArchivo"."fechaActualizacion" IS 'Fecha y hora de última actualización';

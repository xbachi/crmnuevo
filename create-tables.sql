-- Crear tablas para SevenCars CRM en Supabase

-- Tabla Inversores
CREATE TABLE IF NOT EXISTS "Inversor" (
    "id" SERIAL PRIMARY KEY,
    "nombre" TEXT NOT NULL,
    "email" TEXT,
    "telefono" TEXT,
    "capitalAportado" DOUBLE PRECISION DEFAULT 0,
    "capitalInvertido" DOUBLE PRECISION DEFAULT 0,
    "activo" BOOLEAN DEFAULT true,
    "createdAt" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP
);

-- Tabla Vehículos
CREATE TABLE IF NOT EXISTS "Vehiculo" (
    "id" SERIAL PRIMARY KEY,
    "referencia" TEXT UNIQUE NOT NULL,
    "marca" TEXT NOT NULL,
    "modelo" TEXT NOT NULL,
    "matricula" TEXT UNIQUE NOT NULL,
    "bastidor" TEXT UNIQUE NOT NULL,
    "kms" INTEGER NOT NULL,
    "tipo" TEXT NOT NULL,
    "estado" TEXT DEFAULT 'disponible',
    "orden" INTEGER DEFAULT 0,
    
    -- Campos adicionales de Google Sheets
    "fechaMatriculacion" TEXT,
    "año" INTEGER,
    "itv" TEXT,
    "seguro" TEXT,
    "segundaLlave" TEXT,
    "documentacion" TEXT,
    "carpeta" TEXT,
    "master" TEXT,
    "hojasA" TEXT,
    
    -- Campos de inversor
    "esCocheInversor" BOOLEAN DEFAULT false,
    "inversorId" INTEGER,
    "fechaCompra" TIMESTAMP(3),
    "precioCompra" DOUBLE PRECISION,
    "gastosTransporte" DOUBLE PRECISION,
    "gastosTasas" DOUBLE PRECISION,
    "gastosMecanica" DOUBLE PRECISION,
    "gastosPintura" DOUBLE PRECISION,
    "gastosLimpieza" DOUBLE PRECISION,
    "gastosOtros" DOUBLE PRECISION,
    "precioPublicacion" DOUBLE PRECISION,
    "precioVenta" DOUBLE PRECISION,
    "beneficioNeto" DOUBLE PRECISION,
    "notasInversor" TEXT,
    "fotoInversor" TEXT,
    
    "createdAt" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
    
    FOREIGN KEY ("inversorId") REFERENCES "Inversor"("id") ON DELETE SET NULL
);

-- Tabla Clientes
CREATE TABLE IF NOT EXISTS "Cliente" (
    "id" SERIAL PRIMARY KEY,
    "nombre" TEXT NOT NULL,
    "apellidos" TEXT NOT NULL,
    "email" TEXT,
    "telefono" TEXT,
    "fechaNacimiento" TIMESTAMP(3),
    "direccion" TEXT,
    "ciudad" TEXT,
    "codigoPostal" TEXT,
    "provincia" TEXT,
    "dni" TEXT UNIQUE,
    "fechaRegistro" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
    "vehiculosInteres" TEXT,
    "presupuestoMaximo" DOUBLE PRECISION,
    "preferencias" TEXT,
    "observaciones" TEXT,
    "activo" BOOLEAN DEFAULT true,
    "createdAt" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP
);

-- Tabla Notas de Clientes
CREATE TABLE IF NOT EXISTS "NotaCliente" (
    "id" SERIAL PRIMARY KEY,
    "clienteId" INTEGER NOT NULL,
    "fecha" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
    "tipo" TEXT NOT NULL,
    "contenido" TEXT NOT NULL,
    "prioridad" TEXT DEFAULT 'media',
    "completada" BOOLEAN DEFAULT false,
    "createdAt" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
    
    FOREIGN KEY ("clienteId") REFERENCES "Cliente"("id") ON DELETE CASCADE
);

-- Índices para mejorar rendimiento
CREATE INDEX IF NOT EXISTS "Vehiculo_inversorId_idx" ON "Vehiculo"("inversorId");
CREATE INDEX IF NOT EXISTS "Vehiculo_tipo_idx" ON "Vehiculo"("tipo");
CREATE INDEX IF NOT EXISTS "Vehiculo_estado_idx" ON "Vehiculo"("estado");
CREATE INDEX IF NOT EXISTS "NotaCliente_clienteId_idx" ON "NotaCliente"("clienteId");

-- Función para actualizar updatedAt automáticamente
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW."updatedAt" = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Triggers para actualizar updatedAt
CREATE TRIGGER update_inversor_updated_at BEFORE UPDATE ON "Inversor" FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_vehiculo_updated_at BEFORE UPDATE ON "Vehiculo" FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_cliente_updated_at BEFORE UPDATE ON "Cliente" FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_notacliente_updated_at BEFORE UPDATE ON "NotaCliente" FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

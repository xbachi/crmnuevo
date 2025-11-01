CREATE TABLE IF NOT EXISTS interesados (
  id SERIAL PRIMARY KEY,
  nombre VARCHAR(255) NOT NULL,
  apellidos VARCHAR(255) NOT NULL,
  telefono VARCHAR(100) NOT NULL,
  vehiculosInteres TEXT,
  presupuestoMaximo INTEGER,
  kilometrajeMaximo INTEGER,
  "añoMinimo" INTEGER,
  combustiblePreferido VARCHAR(50) DEFAULT 'cualquiera',
  cambioPreferido VARCHAR(50) DEFAULT 'cualquiera',
  formaPagoPreferida VARCHAR(50) DEFAULT 'cualquiera',
  "createdAt" TIMESTAMP NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMP NOT NULL DEFAULT NOW()
);




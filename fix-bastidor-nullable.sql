-- Permite vehículos sin bastidor (p. ej. facturas manuales desde
-- /generador-facturas donde el VIN no siempre está a mano).
-- La columna sigue siendo UNIQUE: Postgres permite múltiples NULL,
-- así que varios vehículos pueden quedar sin bastidor sin colisionar.
ALTER TABLE "Vehiculo" ALTER COLUMN "bastidor" DROP NOT NULL;

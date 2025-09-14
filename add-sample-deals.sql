-- SQL para agregar 5 deals de ejemplo
-- Ejecutar directamente en la base de datos PostgreSQL

-- Primero, verificar si ya existen deals de ejemplo y eliminarlos
DELETE FROM deals WHERE numero LIKE 'DEAL-0000%';

-- Crear clientes de ejemplo si no existen
INSERT INTO clientes (nombre, apellidos, telefono, email, "createdAt", "updatedAt")
SELECT 'Juan', 'Pérez García', '666123456', 'juan.perez@email.com', NOW(), NOW()
WHERE NOT EXISTS (SELECT 1 FROM clientes WHERE telefono = '666123456');

INSERT INTO clientes (nombre, apellidos, telefono, email, "createdAt", "updatedAt")
SELECT 'María', 'García López', '666234567', 'maria.garcia@email.com', NOW(), NOW()
WHERE NOT EXISTS (SELECT 1 FROM clientes WHERE telefono = '666234567');

INSERT INTO clientes (nombre, apellidos, telefono, email, "createdAt", "updatedAt")
SELECT 'Carlos', 'López Martínez', '666345678', 'carlos.lopez@email.com', NOW(), NOW()
WHERE NOT EXISTS (SELECT 1 FROM clientes WHERE telefono = '666345678');

INSERT INTO clientes (nombre, apellidos, telefono, email, "createdAt", "updatedAt")
SELECT 'Ana', 'Martínez Sánchez', '666456789', 'ana.martinez@email.com', NOW(), NOW()
WHERE NOT EXISTS (SELECT 1 FROM clientes WHERE telefono = '666456789');

INSERT INTO clientes (nombre, apellidos, telefono, email, "createdAt", "updatedAt")
SELECT 'Pedro', 'Sánchez Fernández', '666567890', 'pedro.sanchez@email.com', NOW(), NOW()
WHERE NOT EXISTS (SELECT 1 FROM clientes WHERE telefono = '666567890');

-- Crear vehículos de ejemplo si no existen
INSERT INTO vehiculos (marca, modelo, matricula, kms, precio, estado, "createdAt", "updatedAt")
SELECT 'BMW', 'X3', '1234ABC', 45000, 25500, 'disponible', NOW(), NOW()
WHERE NOT EXISTS (SELECT 1 FROM vehiculos WHERE matricula = '1234ABC');

INSERT INTO vehiculos (marca, modelo, matricula, kms, precio, estado, "createdAt", "updatedAt")
SELECT 'Audi', 'A4', '2345BCD', 52000, 18750, 'disponible', NOW(), NOW()
WHERE NOT EXISTS (SELECT 1 FROM vehiculos WHERE matricula = '2345BCD');

INSERT INTO vehiculos (marca, modelo, matricula, kms, precio, estado, "createdAt", "updatedAt")
SELECT 'Mercedes', 'C-Class', '3456CDE', 38000, 32200, 'disponible', NOW(), NOW()
WHERE NOT EXISTS (SELECT 1 FROM vehiculos WHERE matricula = '3456CDE');

INSERT INTO vehiculos (marca, modelo, matricula, kms, precio, estado, "createdAt", "updatedAt")
SELECT 'Volkswagen', 'Golf', '4567DEF', 41000, 15800, 'disponible', NOW(), NOW()
WHERE NOT EXISTS (SELECT 1 FROM vehiculos WHERE matricula = '4567DEF');

INSERT INTO vehiculos (marca, modelo, matricula, kms, precio, estado, "createdAt", "updatedAt")
SELECT 'Seat', 'León', '5678EFG', 48000, 12500, 'disponible', NOW(), NOW()
WHERE NOT EXISTS (SELECT 1 FROM vehiculos WHERE matricula = '5678EFG');

-- Crear los 5 deals de ejemplo
INSERT INTO deals (
  numero, "clienteId", "vehiculoId", estado, "importeTotal", "importeSena",
  "fechaCreacion", "fechaReservaDesde", "fechaVenta", "fechaFactura",
  observaciones, "createdAt", "updatedAt"
) VALUES 
(
  'DEAL-00001',
  (SELECT id FROM clientes WHERE telefono = '666123456' LIMIT 1),
  (SELECT id FROM vehiculos WHERE matricula = '1234ABC' LIMIT 1),
  'nuevo',
  25500,
  300,
  '2024-05-10'::date,
  NULL,
  NULL,
  NULL,
  'Cliente interesado en BMW X3',
  NOW(),
  NOW()
),
(
  'DEAL-00002',
  (SELECT id FROM clientes WHERE telefono = '666234567' LIMIT 1),
  (SELECT id FROM vehiculos WHERE matricula = '2345BCD' LIMIT 1),
  'reserva',
  18750,
  500,
  '2024-05-08'::date,
  '2024-05-08'::date,
  NULL,
  NULL,
  'Reserva confirmada para Audi A4',
  NOW(),
  NOW()
),
(
  'DEAL-00003',
  (SELECT id FROM clientes WHERE telefono = '666345678' LIMIT 1),
  (SELECT id FROM vehiculos WHERE matricula = '3456CDE' LIMIT 1),
  'venta',
  32200,
  1000,
  '2024-05-05'::date,
  '2024-05-05'::date,
  '2024-05-07'::date,
  NULL,
  'Venta completada Mercedes C-Class',
  NOW(),
  NOW()
),
(
  'DEAL-00004',
  (SELECT id FROM clientes WHERE telefono = '666456789' LIMIT 1),
  (SELECT id FROM vehiculos WHERE matricula = '4567DEF' LIMIT 1),
  'factura',
  15800,
  300,
  '2024-05-03'::date,
  '2024-05-03'::date,
  '2024-05-05'::date,
  '2024-05-06'::date,
  'Facturado Volkswagen Golf',
  NOW(),
  NOW()
),
(
  'DEAL-00005',
  (SELECT id FROM clientes WHERE telefono = '666567890' LIMIT 1),
  (SELECT id FROM vehiculos WHERE matricula = '5678EFG' LIMIT 1),
  'nuevo',
  12500,
  200,
  '2024-05-01'::date,
  NULL,
  NULL,
  NULL,
  'Nuevo deal para Seat León',
  NOW(),
  NOW()
);

-- Mostrar resumen de deals creados
SELECT 
  estado,
  COUNT(*) as cantidad,
  SUM("importeTotal") as total_importe,
  SUM("importeSena") as total_senas
FROM deals 
WHERE numero LIKE 'DEAL-0000%'
GROUP BY estado
ORDER BY estado;

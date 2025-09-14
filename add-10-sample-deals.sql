-- Script para agregar 10 deals de ejemplo con diferentes estados
-- Este script crea clientes, vehículos y deals variados para probar la funcionalidad

-- Insertar clientes de ejemplo
INSERT INTO "Cliente" (nombre, apellidos, telefono, email, dni, estado, prioridad, "fechaPrimerContacto", "createdAt", "updatedAt") VALUES
('María', 'García López', '612345678', 'maria.garcia@email.com', '12345678A', 'nuevo', 'alta', NOW() - INTERVAL '5 days', NOW(), NOW()),
('Carlos', 'Martín Ruiz', '623456789', 'carlos.martin@email.com', '23456789B', 'en_seguimiento', 'media', NOW() - INTERVAL '3 days', NOW(), NOW()),
('Ana', 'Fernández Sánchez', '634567890', 'ana.fernandez@email.com', '34567890C', 'cita_agendada', 'alta', NOW() - INTERVAL '7 days', NOW(), NOW()),
('David', 'Rodríguez Pérez', '645678901', 'david.rodriguez@email.com', '45678901D', 'nuevo', 'baja', NOW() - INTERVAL '2 days', NOW(), NOW()),
('Laura', 'López González', '656789012', 'laura.lopez@email.com', '56789012E', 'en_seguimiento', 'media', NOW() - INTERVAL '4 days', NOW(), NOW()),
('Miguel', 'Sánchez Martínez', '667890123', 'miguel.sanchez@email.com', '67890123F', 'nuevo', 'alta', NOW() - INTERVAL '1 day', NOW(), NOW()),
('Sofia', 'Pérez García', '678901234', 'sofia.perez@email.com', '78901234G', 'cita_agendada', 'media', NOW() - INTERVAL '6 days', NOW(), NOW()),
('Javier', 'González Ruiz', '689012345', 'javier.gonzalez@email.com', '89012345H', 'en_seguimiento', 'baja', NOW() - INTERVAL '8 days', NOW(), NOW()),
('Carmen', 'Martínez López', '690123456', 'carmen.martinez@email.com', '90123456I', 'nuevo', 'alta', NOW() - INTERVAL '1 day', NOW(), NOW()),
('Roberto', 'Ruiz Fernández', '601234567', 'roberto.ruiz@email.com', '01234567J', 'en_seguimiento', 'media', NOW() - INTERVAL '3 days', NOW(), NOW());

-- Insertar vehículos de ejemplo
INSERT INTO "Vehiculo" (referencia, marca, modelo, matricula, bastidor, kms, tipo, estado, "precioPublicacion", año, "createdAt", "updatedAt") VALUES
('REF001', 'Volkswagen', 'Golf', '1234ABC', 'VIN123456789', 45000, 'Compra', 'disponible', 18500, 2020, NOW(), NOW()),
('REF002', 'BMW', 'Serie 3', '2345BCD', 'VIN234567890', 32000, 'Compra', 'disponible', 28500, 2019, NOW(), NOW()),
('REF003', 'Audi', 'A4', '3456CDE', 'VIN345678901', 28000, 'Compra', 'disponible', 32000, 2021, NOW(), NOW()),
('REF004', 'Mercedes', 'Clase C', '4567DEF', 'VIN456789012', 35000, 'Compra', 'disponible', 35000, 2020, NOW(), NOW()),
('REF005', 'Toyota', 'Corolla', '5678EFG', 'VIN567890123', 22000, 'Compra', 'disponible', 22000, 2021, NOW(), NOW()),
('REF006', 'Ford', 'Focus', '6789FGH', 'VIN678901234', 38000, 'Compra', 'disponible', 16500, 2019, NOW(), NOW()),
('REF007', 'Seat', 'Leon', '7890GHI', 'VIN789012345', 42000, 'Compra', 'disponible', 14500, 2020, NOW(), NOW()),
('REF008', 'Nissan', 'Qashqai', '8901HIJ', 'VIN890123456', 48000, 'Compra', 'disponible', 19500, 2019, NOW(), NOW()),
('REF009', 'Hyundai', 'Tucson', '9012IJK', 'VIN901234567', 31000, 'Compra', 'disponible', 24500, 2021, NOW(), NOW()),
('REF010', 'Kia', 'Sportage', '0123JKL', 'VIN012345678', 29000, 'Compra', 'disponible', 27500, 2020, NOW(), NOW());

-- Insertar deals de ejemplo con diferentes estados
INSERT INTO "Deal" (numero, "clienteId", "vehiculoId", estado, "importeTotal", "importeSena", "formaPagoSena", observaciones, "responsableComercial", "createdAt", "updatedAt") VALUES
-- Deal 1: Nuevo (sin contrato)
('RES-2025-REF001', 1, 1, 'nuevo', 18500, 300, 'efectivo', 'Cliente interesado en financiación', 'Vendedor 1', NOW() - INTERVAL '5 days', NOW()),
-- Deal 2: Reservado (con contrato de reserva)
('RES-2025-REF002', 2, 2, 'reservado', 28500, 500, 'transferencia', 'Contrato de reserva firmado', 'Vendedor 2', NOW() - INTERVAL '3 days', NOW()),
-- Deal 3: Vendido (con contrato de venta)
('RES-2025-REF003', 3, 3, 'vendido', 32000, 800, 'transferencia', 'Contrato de venta firmado', 'Vendedor 1', NOW() - INTERVAL '7 days', NOW()),
-- Deal 4: Facturado (con factura)
('RES-2025-REF004', 4, 4, 'facturado', 35000, 1000, 'transferencia', 'Factura emitida y pagada', 'Vendedor 3', NOW() - INTERVAL '12 days', NOW()),
-- Deal 5: Nuevo (reciente)
('RES-2025-REF005', 5, 5, 'nuevo', 22000, 300, 'efectivo', 'Cliente en proceso de decisión', 'Vendedor 2', NOW() - INTERVAL '4 days', NOW()),
-- Deal 6: Reservado (con seña alta)
('RES-2025-REF006', 6, 6, 'reservado', 16500, 750, 'transferencia', 'Reserva con seña alta', 'Vendedor 1', NOW() - INTERVAL '1 day', NOW()),
-- Deal 7: Vendido (reciente)
('RES-2025-REF007', 7, 7, 'vendido', 14500, 400, 'efectivo', 'Venta rápida, cliente decidido', 'Vendedor 3', NOW() - INTERVAL '6 days', NOW()),
-- Deal 8: Nuevo (con financiación)
('RES-2025-REF008', 8, 8, 'nuevo', 19500, 300, 'transferencia', 'Solicita financiación bancaria', 'Vendedor 2', NOW() - INTERVAL '8 days', NOW()),
-- Deal 9: Facturado (vehículo premium)
('RES-2025-REF009', 9, 9, 'facturado', 24500, 1200, 'transferencia', 'Vehículo premium, facturación completa', 'Vendedor 1', NOW() - INTERVAL '11 days', NOW()),
-- Deal 10: Reservado (con fecha de entrega)
('RES-2025-REF010', 10, 10, 'reservado', 27500, 600, 'transferencia', 'Entrega programada para próxima semana', 'Vendedor 3', NOW() - INTERVAL '3 days', NOW());

-- Actualizar el estado de los vehículos según el estado de los deals
UPDATE "Vehiculo" SET estado = 'reservado', "dealActivoId" = (
  SELECT id FROM "Deal" WHERE "vehiculoId" = "Vehiculo".id AND estado = 'reservado'
) WHERE id IN (
  SELECT "vehiculoId" FROM "Deal" WHERE estado = 'reservado'
);

UPDATE "Vehiculo" SET estado = 'vendido', "dealActivoId" = (
  SELECT id FROM "Deal" WHERE "vehiculoId" = "Vehiculo".id AND estado IN ('vendido', 'facturado')
) WHERE id IN (
  SELECT "vehiculoId" FROM "Deal" WHERE estado IN ('vendido', 'facturado')
);

-- Mostrar resumen de lo insertado
SELECT 
  'Clientes insertados: ' || COUNT(*) as resumen
FROM "Cliente" 
WHERE "createdAt" >= NOW() - INTERVAL '1 minute'

UNION ALL

SELECT 
  'Vehículos insertados: ' || COUNT(*) as resumen
FROM "Vehiculo" 
WHERE "createdAt" >= NOW() - INTERVAL '1 minute'

UNION ALL

SELECT 
  'Deals insertados: ' || COUNT(*) as resumen
FROM "Deal" 
WHERE "createdAt" >= NOW() - INTERVAL '1 minute'

UNION ALL

SELECT 
  'Deals por estado:' as resumen

UNION ALL

SELECT 
  '  - ' || estado || ': ' || COUNT(*) as resumen
FROM "Deal" 
WHERE "createdAt" >= NOW() - INTERVAL '1 minute'
GROUP BY estado
ORDER BY resumen;

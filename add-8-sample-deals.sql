-- Query SQL para agregar 8 deals de ejemplo
-- Ejecutar en la base de datos PostgreSQL

-- Insertar clientes de ejemplo
INSERT INTO "Cliente" (id, nombre, apellidos, telefono, email, dni, fecha_nacimiento, direccion, ciudad, codigo_postal, pais, notas, vehiculos_interesados, created_at, updated_at)
VALUES 
  ('cliente-001', 'María', 'García López', '612345678', 'maria.garcia@email.com', '12345678A', '1985-03-15', 'Calle Mayor 123', 'Madrid', '28001', 'España', 'Cliente VIP', '["BMW X5", "Audi Q7", "Mercedes GLC"]', NOW(), NOW()),
  ('cliente-002', 'Carlos', 'Rodríguez Martín', '623456789', 'carlos.rodriguez@email.com', '23456789B', '1978-07-22', 'Avenida de la Paz 45', 'Barcelona', '08001', 'España', 'Interesado en SUVs', '["BMW X3", "Audi Q5"]', NOW(), NOW()),
  ('cliente-003', 'Ana', 'Fernández Silva', '634567890', 'ana.fernandez@email.com', '34567890C', '1990-11-08', 'Plaza España 67', 'Valencia', '46001', 'España', 'Primera compra', '["BMW Serie 3", "Audi A4"]', NOW(), NOW()),
  ('cliente-004', 'David', 'González Pérez', '645678901', 'david.gonzalez@email.com', '45678901D', '1982-05-14', 'Calle Gran Vía 89', 'Sevilla', '41001', 'España', 'Cliente frecuente', '["Mercedes C-Class", "BMW Serie 5"]', NOW(), NOW()),
  ('cliente-005', 'Laura', 'Martínez Ruiz', '656789012', 'laura.martinez@email.com', '56789012E', '1993-09-30', 'Paseo de la Castellana 12', 'Madrid', '28046', 'España', 'Joven profesional', '["Audi A3", "BMW Serie 1"]', NOW(), NOW()),
  ('cliente-006', 'Roberto', 'Sánchez Jiménez', '667890123', 'roberto.sanchez@email.com', '67890123F', '1975-12-03', 'Carrer de Balmes 34', 'Barcelona', '08007', 'España', 'Empresario', '["Mercedes S-Class", "BMW Serie 7"]', NOW(), NOW()),
  ('cliente-007', 'Carmen', 'López Torres', '678901234', 'carmen.lopez@email.com', '78901234G', '1988-04-18', 'Calle Colón 56', 'Valencia', '46004', 'España', 'Busca coche familiar', '["BMW X1", "Audi Q3"]', NOW(), NOW()),
  ('cliente-008', 'Javier', 'Hernández Moreno', '689012345', 'javier.hernandez@email.com', '89012345H', '1991-08-25', 'Avenida de la Constitución 78', 'Sevilla', '41004', 'España', 'Deportivo', '["BMW M3", "Audi RS4"]', NOW(), NOW());

-- Insertar vehículos de ejemplo
INSERT INTO "Vehiculo" (id, marca, modelo, matricula, kms, combustible, potencia, color, precio_compra, precio_publicacion, precio_venta, fecha_compra, fecha_publicacion, fecha_venta, estado, estado_vehiculo, descripcion, equipamiento, historial_mantenimiento, documentacion, fotos, notas, created_at, updated_at, deal_activo_id)
VALUES 
  ('vehiculo-001', 'BMW', 'X5', '1234-ABC', 45000, 'Gasolina', '286 CV', 'Negro', 35000.00, 39900.00, NULL, '2024-01-15', '2024-01-20', NULL, 'disponible', 'nuevo', 'BMW X5 en excelente estado', '["Navegador", "Asientos de cuero", "Techo solar"]', 'Revisiones al día', 'ITV hasta 2025', '["foto1.jpg", "foto2.jpg"]', 'Vehículo premium', NOW(), NOW(), NULL),
  ('vehiculo-002', 'Audi', 'A4', '5678-DEF', 62000, 'Diésel', '190 CV', 'Blanco', 28000.00, 32900.00, NULL, '2024-02-10', '2024-02-15', NULL, 'disponible', 'nuevo', 'Audi A4 seminuevo', '["Quattro", "Climatizador", "Bluetooth"]', 'Mantenimiento completo', 'ITV hasta 2026', '["foto3.jpg", "foto4.jpg"]', 'Muy buen estado', NOW(), NOW(), NULL),
  ('vehiculo-003', 'Mercedes', 'C-Class', '9012-GHI', 38000, 'Híbrido', '204 CV', 'Plata', 42000.00, 47900.00, NULL, '2024-03-05', '2024-03-10', NULL, 'disponible', 'nuevo', 'Mercedes C-Class híbrido', '["MBUX", "Asientos calefactables", "Cámara trasera"]', 'Servicio reciente', 'ITV hasta 2025', '["foto5.jpg", "foto6.jpg"]', 'Tecnología avanzada', NOW(), NOW(), NULL),
  ('vehiculo-004', 'BMW', 'Serie 3', '3456-JKL', 55000, 'Gasolina', '258 CV', 'Azul', 32000.00, 36900.00, NULL, '2024-03-20', '2024-03-25', NULL, 'disponible', 'nuevo', 'BMW Serie 3 deportivo', '["Sport Package", "Suspensión adaptativa", "Escape deportivo"]', 'Revisión BMW', 'ITV hasta 2026', '["foto7.jpg", "foto8.jpg"]', 'Muy deportivo', NOW(), NOW(), NULL),
  ('vehiculo-005', 'Audi', 'Q7', '7890-MNO', 28000, 'Diésel', '286 CV', 'Negro', 55000.00, 62900.00, NULL, '2024-04-01', '2024-04-05', NULL, 'disponible', 'nuevo', 'Audi Q7 familiar', '["Quattro", "7 plazas", "Maletero grande"]', 'Mantenimiento Audi', 'ITV hasta 2027', '["foto9.jpg", "foto10.jpg"]', 'Perfecto para familias', NOW(), NOW(), NULL),
  ('vehiculo-006', 'Mercedes', 'GLC', '2468-PQR', 41000, 'Gasolina', '211 CV', 'Rojo', 38000.00, 43900.00, NULL, '2024-04-15', '2024-04-20', NULL, 'disponible', 'nuevo', 'Mercedes GLC SUV', '["4MATIC", "Techo panorámico", "Asientos eléctricos"]', 'Servicio Mercedes', 'ITV hasta 2025', '["foto11.jpg", "foto12.jpg"]', 'SUV premium', NOW(), NOW(), NULL),
  ('vehiculo-007', 'BMW', 'X3', '1357-STU', 47000, 'Diésel', '231 CV', 'Gris', 36000.00, 41900.00, NULL, '2024-05-01', '2024-05-05', NULL, 'disponible', 'nuevo', 'BMW X3 seminuevo', '["xDrive", "Navegador profesional", "Harman Kardon"]', 'Revisión completa', 'ITV hasta 2026', '["foto13.jpg", "foto14.jpg"]', 'Excelente estado', NOW(), NOW(), NULL),
  ('vehiculo-008', 'Audi', 'A3', '9753-VWX', 52000, 'Gasolina', '150 CV', 'Blanco', 25000.00, 28900.00, NULL, '2024-05-10', '2024-05-15', NULL, 'disponible', 'nuevo', 'Audi A3 compacto', '["Virtual Cockpit", "Apple CarPlay", "Sensor de aparcamiento"]', 'Mantenimiento regular', 'ITV hasta 2025', '["foto15.jpg", "foto16.jpg"]', 'Coche urbano perfecto', NOW(), NOW(), NULL);

-- Insertar deals de ejemplo
INSERT INTO "Deal" (id, cliente_id, vehiculo_id, total_deal, senna, fecha_creacion, fecha_actualizacion, estado, notas, documentos, created_at, updated_at)
VALUES 
  ('deal-001', 'cliente-001', 'vehiculo-001', 39900.00, 5000.00, '2024-01-25', '2024-01-25', 'nuevo', 'Cliente interesado en BMW X5', '{}', NOW(), NOW()),
  ('deal-002', 'cliente-002', 'vehiculo-002', 32900.00, 3000.00, '2024-02-20', '2024-02-20', 'reservado', 'Audi A4 reservado, esperando documentación', '{"contrato_reserva": "contrato_001.pdf"}', NOW(), NOW()),
  ('deal-003', 'cliente-003', 'vehiculo-003', 47900.00, 7000.00, '2024-03-15', '2024-03-15', 'vendido', 'Mercedes C-Class vendido, entregado', '{"contrato_venta": "venta_001.pdf", "factura": "factura_001.pdf"}', NOW(), NOW()),
  ('deal-004', 'cliente-004', 'vehiculo-004', 36900.00, 4000.00, '2024-03-30', '2024-03-30', 'facturado', 'BMW Serie 3 facturado y entregado', '{"contrato_venta": "venta_002.pdf", "factura": "factura_002.pdf", "entrega": "entrega_001.pdf"}', NOW(), NOW()),
  ('deal-005', 'cliente-005', 'vehiculo-005', 62900.00, 8000.00, '2024-04-10', '2024-04-10', 'nuevo', 'Audi Q7 para familia numerosa', '{}', NOW(), NOW()),
  ('deal-006', 'cliente-006', 'vehiculo-006', 43900.00, 6000.00, '2024-04-25', '2024-04-25', 'reservado', 'Mercedes GLC reservado por empresario', '{"contrato_reserva": "contrato_002.pdf"}', NOW(), NOW()),
  ('deal-007', 'cliente-007', 'vehiculo-007', 41900.00, 5000.00, '2024-05-08', '2024-05-08', 'vendido', 'BMW X3 vendido, pendiente entrega', '{"contrato_venta": "venta_003.pdf"}', NOW(), NOW()),
  ('deal-008', 'cliente-008', 'vehiculo-008', 28900.00, 2000.00, '2024-05-18', '2024-05-18', 'nuevo', 'Audi A3 para joven profesional', '{}', NOW(), NOW());

-- Actualizar vehículos con deal activo
UPDATE "Vehiculo" SET deal_activo_id = 'deal-002', estado = 'reservado' WHERE id = 'vehiculo-002';
UPDATE "Vehiculo" SET deal_activo_id = 'deal-003', estado = 'vendido' WHERE id = 'vehiculo-003';
UPDATE "Vehiculo" SET deal_activo_id = 'deal-004', estado = 'vendido' WHERE id = 'vehiculo-004';
UPDATE "Vehiculo" SET deal_activo_id = 'deal-006', estado = 'reservado' WHERE id = 'vehiculo-006';
UPDATE "Vehiculo" SET deal_activo_id = 'deal-007', estado = 'vendido' WHERE id = 'vehiculo-007';

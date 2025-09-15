-- Crear tabla para recordatorios de clientes
CREATE TABLE IF NOT EXISTS "ClienteReminder" (
  id SERIAL PRIMARY KEY,
  "clienteId" INTEGER NOT NULL REFERENCES "Cliente"(id) ON DELETE CASCADE,
  titulo VARCHAR(255) NOT NULL,
  descripcion TEXT,
  tipo VARCHAR(50) NOT NULL CHECK (tipo IN ('llamada', 'visita', 'email', 'seguimiento', 'otro')),
  prioridad VARCHAR(50) NOT NULL CHECK (prioridad IN ('alta', 'media', 'baja')),
  "fechaRecordatorio" TIMESTAMP NOT NULL,
  completado BOOLEAN NOT NULL DEFAULT FALSE,
  "createdAt" TIMESTAMP DEFAULT NOW(),
  "updatedAt" TIMESTAMP DEFAULT NOW()
);

-- Crear índices para mejorar el rendimiento
CREATE INDEX IF NOT EXISTS idx_cliente_reminder_cliente_id ON "ClienteReminder"("clienteId");
CREATE INDEX IF NOT EXISTS idx_cliente_reminder_fecha ON "ClienteReminder"("fechaRecordatorio");
CREATE INDEX IF NOT EXISTS idx_cliente_reminder_completado ON "ClienteReminder"(completado);
CREATE INDEX IF NOT EXISTS idx_cliente_reminder_tipo ON "ClienteReminder"(tipo);
CREATE INDEX IF NOT EXISTS idx_cliente_reminder_prioridad ON "ClienteReminder"(prioridad);

-- Comentarios en la tabla
COMMENT ON TABLE "ClienteReminder" IS 'Recordatorios manuales para clientes';
COMMENT ON COLUMN "ClienteReminder".tipo IS 'Tipo de recordatorio: llamada, visita, email, seguimiento, otro';
COMMENT ON COLUMN "ClienteReminder".prioridad IS 'Prioridad del recordatorio: alta, media, baja';
COMMENT ON COLUMN "ClienteReminder"."fechaRecordatorio" IS 'Fecha y hora programada para el recordatorio';
COMMENT ON COLUMN "ClienteReminder".completado IS 'Indica si el recordatorio ha sido completado';

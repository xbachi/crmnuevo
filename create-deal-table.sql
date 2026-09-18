-- Tabla Deal (reservas/ventas). En producción la creó Prisma en su día; este
-- archivo documenta el esquema base (docs/schema.prisma) y permite levantar una
-- base vacía (tests de integración/E2E). Las columnas posteriores las añaden
-- los add-*.sql correspondientes. Idempotente.

CREATE TABLE IF NOT EXISTS "Deal" (
  id                        SERIAL PRIMARY KEY,
  numero                    TEXT NOT NULL UNIQUE,
  "clienteId"               INTEGER NOT NULL REFERENCES "Cliente"(id),
  "vehiculoId"              INTEGER NOT NULL REFERENCES "Vehiculo"(id),
  estado                    TEXT NOT NULL DEFAULT 'nuevo',
  resultado                 TEXT,
  motivo                    TEXT,
  "importeTotal"            DOUBLE PRECISION,
  "importeSena"             DOUBLE PRECISION,
  "formaPagoSena"           TEXT,
  "restoAPagar"             DOUBLE PRECISION,
  financiacion              BOOLEAN NOT NULL DEFAULT false,
  "entidadFinanciera"       TEXT,
  "fechaCreacion"           TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "fechaReservaDesde"       TIMESTAMP(3),
  "fechaReservaExpira"      TIMESTAMP(3),
  "fechaVentaFirmada"       TIMESTAMP(3),
  "fechaFacturada"          TIMESTAMP(3),
  "fechaEntrega"            TIMESTAMP(3),
  "contratoReserva"         TEXT,
  "contratoVenta"           TEXT,
  factura                   TEXT,
  recibos                   TEXT,
  "pagosSena"               TEXT,
  "pagosResto"              TEXT,
  observaciones             TEXT,
  "responsableComercial"    TEXT,
  -- cambioNombreSolicitado, documentacionRecibida, clienteAvisado y
  -- documentacionRetirada los añade add-cambio-nombre-fields.sql
  "logHistorial"            TEXT,
  "createdAt"               TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"               TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "Deal_clienteId_idx"  ON "Deal" ("clienteId");
CREATE INDEX IF NOT EXISTS "Deal_vehiculoId_idx" ON "Deal" ("vehiculoId");
CREATE INDEX IF NOT EXISTS "Deal_estado_idx"     ON "Deal" (estado);

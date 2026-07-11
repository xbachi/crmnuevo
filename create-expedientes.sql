-- =============================================================================
-- create-expedientes.sql — Expediente de venta como entidad de primera clase
-- (patrón "deal jacket" de los DMS).
--
-- Cada factura de venta emitida tiene un expediente con la checklist de
-- documentos requeridos según el tipo de operación:
--   · retail-vat  → factura de venta + contrato de venta + factura de compra
--   · retail-rebu → factura de venta + contrato de venta + CONTRATO de compra
--                   (coche comprado a particular: no hay factura de compra)
--   · b2b         → factura de venta + contrato de venta + factura de compra
--                   (contrato de compra opcional)
--   · deposito    → factura de venta + contrato de venta + contrato de depósito
--
-- Regla de negocio dura: un expediente incompleto NUNCA se considera
-- finalizado — el CHECK de estado + la lógica de src/lib/expedienteChecklist.ts
-- degradan a 'incompleto' cualquier expediente al que le falte un requerido.
--
-- checklist JSONB: array de items {clave, label, requerido, presente, nota}.
--
-- Idempotente: seguro de correr varias veces. NO se aplica automáticamente.
-- =============================================================================

CREATE TABLE IF NOT EXISTS expedientes (
  id             SERIAL PRIMARY KEY,
  tipo_operacion TEXT NOT NULL
                 CHECK (tipo_operacion IN ('retail-vat', 'retail-rebu', 'b2b', 'deposito')),
  deal_id        INT,           -- venta retail (tabla "Deal"); NULL si B2B
  b2b_venta_id   INT,           -- venta B2B (tabla venta_b2b); NULL si retail
  vehiculo_id    INT,
  matricula      TEXT,          -- normalizada (sin espacios/guiones, mayúsculas)
  numero_factura TEXT UNIQUE,   -- full_invoice_number de invoices (1 expediente por factura)
  invoice_date   DATE,
  estado         TEXT NOT NULL DEFAULT 'incompleto'
                 CHECK (estado IN ('incompleto', 'completo', 'enviado', 'confirmado')),
  checklist      JSONB NOT NULL DEFAULT '[]',
  notas          TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_expedientes_estado ON expedientes(estado);
CREATE INDEX IF NOT EXISTS idx_expedientes_invoice_date ON expedientes(invoice_date);

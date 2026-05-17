-- 0005-b2b-module.sql
--
-- Crea las tablas para el módulo de CLIENTES B2B (compraventa profesional
-- entre dealerships, autónomos del sector y profesionales). Independiente
-- del flujo retail (Deal/Cliente) — diferente lifecycle: sin reserva, sin
-- desglose de IVA, sin facturación, contrato "en el estado".
--
-- Estructura:
--   - cliente_b2b: profesional / empresa / autónomo
--   - venta_b2b: cada operación con un cliente B2B + un vehículo + PDF
--
-- Convención: snake_case (en línea con invoices/invoice_sequences del 0001).
--
-- Ejecutar manualmente desde SQL Editor de Supabase (igual que 0001-0004).

BEGIN;

-- =============================================================================
-- cliente_b2b
-- =============================================================================
CREATE TABLE IF NOT EXISTS cliente_b2b (
  id                  SERIAL PRIMARY KEY,
  tipo                TEXT NOT NULL CHECK (tipo IN ('empresa', 'autonomo', 'profesional')),
  razon_social        TEXT NOT NULL,           -- nombre de empresa o nombre completo si autónomo/profesional
  cif_nif             TEXT NOT NULL,           -- CIF (empresa) o NIF/DNI (autónomo/profesional)
  contacto_nombre     TEXT,                    -- persona de contacto si es empresa
  telefono            TEXT,
  email               TEXT,
  direccion           TEXT,
  ciudad              TEXT,
  codigo_postal       TEXT,
  provincia           TEXT,
  notas               TEXT,
  activo              BOOLEAN NOT NULL DEFAULT TRUE,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_cliente_b2b_cif_nif ON cliente_b2b(cif_nif);
CREATE INDEX IF NOT EXISTS idx_cliente_b2b_razon_social ON cliente_b2b(razon_social);
CREATE INDEX IF NOT EXISTS idx_cliente_b2b_activo ON cliente_b2b(activo);

-- =============================================================================
-- venta_b2b
-- =============================================================================
CREATE TABLE IF NOT EXISTS venta_b2b (
  id                  SERIAL PRIMARY KEY,
  numero              TEXT NOT NULL UNIQUE,   -- p.ej. B2B-2026-0001
  cliente_b2b_id      INTEGER NOT NULL REFERENCES cliente_b2b(id) ON DELETE RESTRICT,
  vehiculo_id         INTEGER REFERENCES "Vehiculo"(id) ON DELETE SET NULL,

  -- Snapshot del vehículo (defensivo: si el vehículo se modifica/elimina,
  -- el contrato firmado mantiene los datos exactos)
  vehiculo_marca      TEXT,
  vehiculo_modelo     TEXT,
  vehiculo_matricula  TEXT,
  vehiculo_bastidor   TEXT,
  vehiculo_kms        INTEGER,
  vehiculo_anio       INTEGER,
  vehiculo_fecha_matriculacion TEXT,

  -- Datos de la venta
  fecha_venta         DATE NOT NULL DEFAULT CURRENT_DATE,
  lugar_venta         TEXT NOT NULL DEFAULT 'Alaquàs',
  precio_venta        NUMERIC(12, 2) NOT NULL,
  forma_pago          TEXT NOT NULL CHECK (forma_pago IN ('transferencia', 'efectivo', 'financiado', 'otro')),
  notas               TEXT,
  notas_estado_vehiculo TEXT,

  -- PDF generado
  pdf_url             TEXT,
  pdf_storage_key     TEXT,
  pdf_generated_at    TIMESTAMPTZ,
  status              TEXT NOT NULL DEFAULT 'BORRADOR'
                      CHECK (status IN ('BORRADOR', 'PDF_PENDING', 'FIRMADO', 'ANULADO')),

  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_venta_b2b_cliente ON venta_b2b(cliente_b2b_id);
CREATE INDEX IF NOT EXISTS idx_venta_b2b_vehiculo ON venta_b2b(vehiculo_id);
CREATE INDEX IF NOT EXISTS idx_venta_b2b_fecha ON venta_b2b(fecha_venta DESC);
CREATE INDEX IF NOT EXISTS idx_venta_b2b_status ON venta_b2b(status);

-- =============================================================================
-- Secuencia simple de numeración (B2B-YYYY-NNNN)
-- Se usa MAX(numero) en el código aplicación para evitar deadlocks; este
-- esquema solo guarda los registros — la generación del número va por código.
-- =============================================================================

COMMIT;

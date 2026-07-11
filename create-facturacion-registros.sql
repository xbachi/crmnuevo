-- Registro de facturación con hash encadenado ("Verifactu-lite").
-- Cadena de integridad inspirada en el RD 1007/2023 (Verifactu): cada alta o
-- anulación de factura añade un eslabón cuyo hash incluye el hash del eslabón
-- anterior, de modo que borrar o alterar una factura emitida rompe la cadena
-- de forma detectable (GET /api/admin/verifactu/verify-chain).
--
-- NOTA: esto es PREPARACIÓN para Verifactu — cadena de integridad interna,
-- pendiente de homologación. NO implementa el envío a la AEAT ni supone
-- cumplimiento legal del RD 1007/2023.

CREATE TABLE IF NOT EXISTS facturacion_registros (
  id               SERIAL PRIMARY KEY,
  -- Referencia lógica a invoices.id. Sin FK dura a propósito: el registro
  -- debe sobrevivir a datos legacy y a cualquier manipulación de invoices.
  invoice_id       INTEGER,
  tipo_registro    TEXT NOT NULL CHECK (tipo_registro IN ('alta', 'anulacion')),
  numero_serie     TEXT NOT NULL,        -- full_invoice_number
  fecha_expedicion DATE NOT NULL,
  nif_emisor       TEXT NOT NULL,
  importe_total    NUMERIC(12,2) NOT NULL,
  hash_anterior    TEXT,                 -- NULL sólo en el primer eslabón
  hash_actual      TEXT NOT NULL UNIQUE,
  qr_payload       TEXT,
  metadata         JSONB,
  created_at       TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS ix_facturacion_registros_numero_serie
  ON facturacion_registros (numero_serie);
CREATE INDEX IF NOT EXISTS ix_facturacion_registros_created_at
  ON facturacion_registros (created_at);
-- Nunca dos 'alta' (ni dos 'anulacion') del mismo número de factura.
CREATE UNIQUE INDEX IF NOT EXISTS ux_facturacion_registros_numero_tipo
  ON facturacion_registros (numero_serie, tipo_registro);

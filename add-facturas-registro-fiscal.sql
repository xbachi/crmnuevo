-- Capa fiscal sobre facturas_registro (hoy sólo sabe "qué PDF es y dónde vive").
-- Para cerrar un trimestre hace falta más que el archivo: NIF del emisor, base y
-- cuota, si el IVA se deduce, en qué período se declaró y en qué estado está el
-- documento. Todo aditivo: las ~183 filas de 2026 ya entregadas siguen válidas.
--
-- ORDEN: aplicar create-proveedores.sql ANTES (este archivo referencia proveedores.id).
-- Idempotente. NO se aplica automáticamente: correr a mano en Supabase.

-- ── Identidad del emisor ─────────────────────────────────────────────────────
ALTER TABLE facturas_registro ADD COLUMN IF NOT EXISTS proveedor_id INT REFERENCES proveedores(id);
ALTER TABLE facturas_registro ADD COLUMN IF NOT EXISTS nif_proveedor TEXT;
ALTER TABLE facturas_registro ADD COLUMN IF NOT EXISTS nif_valido BOOLEAN;   -- NULL = sin verificar

-- ── Importes y devengo ───────────────────────────────────────────────────────
-- fecha_operacion = devengo real; puede diferir de fecha_factura (emisión).
ALTER TABLE facturas_registro ADD COLUMN IF NOT EXISTS fecha_operacion DATE;
-- Denormalizados: suma de facturas_registro_lineas. La app mantiene la coherencia
-- (Σ líneas = importe ±0,02); no hay trigger, es el patrón del repo.
ALTER TABLE facturas_registro ADD COLUMN IF NOT EXISTS base_total NUMERIC(12,2);
ALTER TABLE facturas_registro ADD COLUMN IF NOT EXISTS cuota_iva_total NUMERIC(12,2);

-- ── Clasificación fiscal ─────────────────────────────────────────────────────
ALTER TABLE facturas_registro ADD COLUMN IF NOT EXISTS tipo_operacion TEXT NOT NULL DEFAULT 'interior';
ALTER TABLE facturas_registro ADD COLUMN IF NOT EXISTS deducible TEXT NOT NULL DEFAULT 'duda';
ALTER TABLE facturas_registro ADD COLUMN IF NOT EXISTS deducible_pct NUMERIC(5,2);
-- subcategoria_gasto: suministros|alquiler|seguros|profesionales|publicidad|financieros|otros.
-- SIN CHECK a propósito: es libre/evolutivo (el plan contable de la casa cambia
-- más rápido que las migraciones). La app ofrece la lista; la DB no la impone.
ALTER TABLE facturas_registro ADD COLUMN IF NOT EXISTS subcategoria_gasto TEXT;

-- ── Ciclo de vida del documento ──────────────────────────────────────────────
-- registrada → extraida → pendiente-validar → validada → en-borrador → declarada
-- (rectificada/anulada son salidas laterales). 'registrada' es la verdad de las
-- filas viejas: existen como archivo, sin datos fiscales extraídos.
ALTER TABLE facturas_registro ADD COLUMN IF NOT EXISTS estado TEXT NOT NULL DEFAULT 'registrada';

-- ── Banderas de calidad ──────────────────────────────────────────────────────
ALTER TABLE facturas_registro ADD COLUMN IF NOT EXISTS posible_duplicado BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE facturas_registro ADD COLUMN IF NOT EXISTS duplicado_de INT REFERENCES facturas_registro(id);
ALTER TABLE facturas_registro ADD COLUMN IF NOT EXISTS datos_incompletos BOOLEAN NOT NULL DEFAULT false;
-- tardia: llegó después de declarar su período natural → se imputa a *_declarado.
ALTER TABLE facturas_registro ADD COLUMN IF NOT EXISTS tardia BOOLEAN NOT NULL DEFAULT false;

-- ── Período de imputación (puede diferir del natural: facturas tardías) ──────
ALTER TABLE facturas_registro ADD COLUMN IF NOT EXISTS anio_declarado INT;
ALTER TABLE facturas_registro ADD COLUMN IF NOT EXISTS trimestre_declarado INT;

-- ── Trazabilidad de la extracción ────────────────────────────────────────────
-- extraccion_metodo: 'regex' | 'pdftotext' | 'llm' | 'manual'. SIN CHECK duro:
-- los métodos cambian con el pipeline n8n y no queremos migrar por cada uno.
ALTER TABLE facturas_registro ADD COLUMN IF NOT EXISTS extraccion_metodo TEXT;
ALTER TABLE facturas_registro ADD COLUMN IF NOT EXISTS extraccion_confianza NUMERIC(3,2);  -- 0.00..1.00
ALTER TABLE facturas_registro ADD COLUMN IF NOT EXISTS extraccion_raw JSONB;               -- payload crudo del extractor

-- ── Validación humana ────────────────────────────────────────────────────────
ALTER TABLE facturas_registro ADD COLUMN IF NOT EXISTS validada_por TEXT;
ALTER TABLE facturas_registro ADD COLUMN IF NOT EXISTS validada_at TIMESTAMPTZ;

-- ── Pago (independiente del devengo: se declara por devengo, no por caja) ────
ALTER TABLE facturas_registro ADD COLUMN IF NOT EXISTS estado_pago TEXT NOT NULL DEFAULT 'pendiente';

-- ── CHECKs con nombre explícito (idempotentes) ───────────────────────────────
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_fr_tipo_operacion') THEN
    ALTER TABLE facturas_registro ADD CONSTRAINT chk_fr_tipo_operacion
      CHECK (tipo_operacion IN ('interior','intracomunitaria','importacion','isp','exenta','rebu-compra','suplido'));
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_fr_deducible') THEN
    ALTER TABLE facturas_registro ADD CONSTRAINT chk_fr_deducible
      CHECK (deducible IN ('si','no','parcial','duda'));
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_fr_estado') THEN
    ALTER TABLE facturas_registro ADD CONSTRAINT chk_fr_estado
      CHECK (estado IN ('registrada','extraida','pendiente-validar','validada','en-borrador','declarada','rectificada','anulada'));
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_fr_trimestre_declarado') THEN
    ALTER TABLE facturas_registro ADD CONSTRAINT chk_fr_trimestre_declarado
      CHECK (trimestre_declarado IS NULL OR trimestre_declarado BETWEEN 1 AND 4);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_fr_estado_pago') THEN
    ALTER TABLE facturas_registro ADD CONSTRAINT chk_fr_estado_pago
      CHECK (estado_pago IN ('pendiente','parcial','pagada','na'));
  END IF;
END $$;

-- ── Índices ──────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS ix_fr_estado    ON facturas_registro (estado);
CREATE INDEX IF NOT EXISTS ix_fr_declarado ON facturas_registro (anio_declarado, trimestre_declarado);
CREATE INDEX IF NOT EXISTS ix_fr_proveedor_id ON facturas_registro (proveedor_id) WHERE proveedor_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS ix_fr_posible_dup  ON facturas_registro (posible_duplicado) WHERE posible_duplicado;

-- ── Backfill: el período de imputación arranca = período natural ─────────────
-- Idempotente (sólo toca filas sin imputar). NO se toca `estado`: queda
-- 'registrada' por DEFAULT, que es la verdad de las filas de 2026.
UPDATE facturas_registro
   SET anio_declarado = anio,
       trimestre_declarado = trimestre
 WHERE anio_declarado IS NULL
   AND anio IS NOT NULL;

COMMENT ON COLUMN facturas_registro.estado IS
  'Ciclo de vida: registrada→extraida→pendiente-validar→validada→en-borrador→declarada (rectificada/anulada = salidas laterales).';
COMMENT ON COLUMN facturas_registro.anio_declarado IS
  'Período de imputación real. Arranca = período natural (anio/trimestre); difiere en facturas tardías.';
COMMENT ON COLUMN facturas_registro.base_total IS
  'Denormalizado = Σ facturas_registro_lineas.base. Coherencia mantenida por la app (±0,02), no por trigger.';

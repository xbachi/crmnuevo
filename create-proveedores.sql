-- Maestro de proveedores (hoy facturas_registro.proveedor es texto libre).
-- Un mismo proveedor llega escrito de N formas distintas según la fuente
-- (email, OneDrive, concepto bancario) → aliases[] resuelve el matching y
-- proveedor_id da la identidad estable. Los *_defecto se aplican al extraer
-- una factura nueva: evitan reclasificar a mano lo que ya sabemos del proveedor.
-- Los NIF NO se inventan: quedan NULL y se completan a mano en la ficha.
-- Idempotente. NO se aplica automáticamente: correr a mano en Supabase.
-- ORDEN: este archivo va PRIMERO (add-facturas-registro-fiscal.sql lo referencia).

CREATE TABLE IF NOT EXISTS proveedores (
  id                      SERIAL PRIMARY KEY,
  nombre                  TEXT NOT NULL,                    -- canónico
  nif                     TEXT,                             -- NIF/CIF español o NIF-IVA UE (ej. DE… para ALD/Ayvens)
  nif_valido              BOOLEAN,                          -- NULL = sin verificar
  pais                    TEXT NOT NULL DEFAULT 'ES',
  aliases                 TEXT[] NOT NULL DEFAULT '{}',     -- matching contra facturas_registro.proveedor y conceptos bancarios
  iban                    TEXT,
  categoria_defecto       TEXT,                             -- 'gestoria' | 'coche-servicio' | 'coche-compra'
  tipo_operacion_defecto  TEXT NOT NULL DEFAULT 'interior',
  deducible_defecto       TEXT NOT NULL DEFAULT 'si',
  subcategoria_defecto    TEXT,
  validacion_auto         BOOLEAN NOT NULL DEFAULT false,   -- permite auto-validar con confianza alta
  plantilla_extraccion    TEXT,                             -- id de plantilla regex en n8n
  activo                  BOOLEAN NOT NULL DEFAULT true,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- identidad canónica case-insensitive (el backfill matchea por lower(nombre))
CREATE UNIQUE INDEX IF NOT EXISTS ux_proveedores_nombre ON proveedores (lower(nombre));
-- un NIF = un proveedor (sólo cuando hay NIF: la mayoría arranca NULL)
CREATE UNIQUE INDEX IF NOT EXISTS ux_proveedores_nif
  ON proveedores (nif)
  WHERE nif IS NOT NULL AND nif <> '';
-- resolución de alias → proveedor (aliases @> ARRAY['...'])
CREATE INDEX IF NOT EXISTS ix_proveedores_aliases ON proveedores USING GIN (aliases);

-- CHECKs con nombre explícito: mismos valores que facturas_registro (los *_defecto
-- se copian tal cual a la factura al extraer, así que el dominio debe coincidir).
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_proveedores_tipo_operacion') THEN
    ALTER TABLE proveedores ADD CONSTRAINT chk_proveedores_tipo_operacion
      CHECK (tipo_operacion_defecto IN ('interior','intracomunitaria','importacion','isp','exenta','rebu-compra','suplido'));
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_proveedores_deducible') THEN
    ALTER TABLE proveedores ADD CONSTRAINT chk_proveedores_deducible
      CHECK (deducible_defecto IN ('si','no','parcial','duda'));
  END IF;
END $$;

COMMENT ON TABLE proveedores IS
  'Maestro de proveedores: identidad canónica + defaults fiscales aplicados al extraer facturas nuevas.';
COMMENT ON COLUMN proveedores.aliases IS
  'Variantes del nombre tal como aparecen en facturas_registro.proveedor y en conceptos bancarios.';
COMMENT ON COLUMN proveedores.validacion_auto IS
  'true = las facturas de este proveedor pueden pasar a validada sin revisión si extraccion_confianza es alta.';

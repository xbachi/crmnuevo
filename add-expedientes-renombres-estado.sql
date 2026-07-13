-- =============================================================================
-- add-expedientes-renombres-estado.sql — la traza se escribe ANTES de renombrar.
--
-- Incidente 2T 2026: el renombrado se ejecutó en OneDrive pero la función de
-- Vercel murió (502) antes de escribir la traza → 52 archivos renombrados sin
-- registro, imposibles de revertir (hubo que reconstruirlos a mano por hash).
--
-- A partir de ahora el endpoint registra la INTENCIÓN (estado='pendiente')
-- antes de tocar nada y la CONFIRMA con el resultado real del server:
--   'pendiente' → se pidió, no se sabe el resultado (la función murió / el
--                 webhook no respondió). Rastro suficiente para revertir a mano.
--   'aplicado'  → el server confirmó la operación.
--   'fallido'   → el server la rechazó explícitamente (no se tocó el archivo).
--   'omitido'   → no hacía falta (ya tenía el nombre canónico).
--
-- Las filas anteriores a esta migración son todas aplicadas → DEFAULT 'aplicado'.
--
-- ADITIVA e idempotente: seguro de correr varias veces. NO se aplica sola.
-- =============================================================================

ALTER TABLE expedientes_renombres
  ADD COLUMN IF NOT EXISTS estado TEXT NOT NULL DEFAULT 'aplicado';

ALTER TABLE expedientes_renombres
  ADD COLUMN IF NOT EXISTS motivo TEXT;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'expedientes_renombres_estado_check'
  ) THEN
    ALTER TABLE expedientes_renombres
      ADD CONSTRAINT expedientes_renombres_estado_check
      CHECK (estado IN ('pendiente', 'aplicado', 'fallido', 'omitido'));
  END IF;
END $$;

-- El endpoint busca las intenciones sin confirmar del trimestre para reusarlas
-- (reanudar) en vez de duplicar filas.
CREATE INDEX IF NOT EXISTS idx_expedientes_renombres_estado
  ON expedientes_renombres (anio, trimestre, estado);

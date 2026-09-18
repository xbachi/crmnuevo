-- Campos del coche que rellenó el documento (permiso de circulación / tarjeta
-- ITV) y que todavía no ha confirmado una persona.
--
-- POR QUÉ: el cron de fichas técnicas ahora escribe solo los campos que el CRM
-- tiene vacíos (bastidor, fecha de 1ª matriculación, combustible, cilindrada,
-- potencia, plazas, versión). Eso es un dato leído por IA de una foto: sirve
-- para trabajar, pero no para publicar el coche sin que nadie lo haya mirado.
-- Esta tabla es la lista de "esto lo puso el documento, falta confirmarlo":
--   · la ficha del vehículo la pinta en el bloque «Datos del permiso»,
--   · el bloqueo de publicación la consulta (confirmado_at IS NULL → falta).
--
-- Una fila por (vehiculo_id, campo): si llega una foto mejor y se vuelve a
-- rellenar el mismo campo, se pisa la fila y vuelve a quedar sin confirmar.
-- El historial completo, con valor anterior para deshacer, sigue en
-- fichas_tecnicas_correcciones: esta tabla es estado, no auditoría.
--
-- `campo` es el nombre lógico del módulo src/lib/camposVehiculo.ts
-- (p.ej. 'bastidor', 'plazas', 'nombre_comercial'), no la columna SQL: el
-- mismo campo puede vivir en "Vehiculo" o en vehiculo_ficha_comercial.
--
-- ficha_id ON DELETE SET NULL: borrar la extracción no puede borrar el estado
-- de confirmación del coche. vehiculo_id ON DELETE CASCADE: si el coche se va,
-- esto no significa nada.
--
-- Aditiva e idempotente. No toca ninguna tabla existente.

CREATE TABLE IF NOT EXISTS vehiculo_campos_doc (
  id             SERIAL PRIMARY KEY,
  vehiculo_id    INTEGER NOT NULL REFERENCES "Vehiculo"(id) ON DELETE CASCADE,
  campo          TEXT NOT NULL,
  valor          TEXT,
  confianza      NUMERIC(3,2),
  ficha_id       INTEGER REFERENCES fichas_tecnicas(id) ON DELETE SET NULL,
  archivo        TEXT,
  aplicado_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  confirmado_at  TIMESTAMPTZ,
  confirmado_por TEXT,
  CONSTRAINT uq_vehiculo_campos_doc UNIQUE (vehiculo_id, campo)
);

-- El bloqueo de publicación y el bloque de la ficha piden "los pendientes de
-- este coche": índice parcial, que las confirmadas no interesan.
CREATE INDEX IF NOT EXISTS ix_vehiculo_campos_doc_pendientes
  ON vehiculo_campos_doc (vehiculo_id)
  WHERE confirmado_at IS NULL;

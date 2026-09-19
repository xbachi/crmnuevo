-- Dónde está físicamente el coche (columna ESTADO de la hoja COMPRAS: NAVE,
-- campa, taller...). Texto libre a propósito: la hoja no usa un vocabulario
-- cerrado y normalizarlo ahora perdería información.
--
-- No se reutiliza ninguna columna existente: "Vehiculo".estado es el estado del
-- pipeline (PUBLICADO, VENDIDO...), `recibido`/`recibidoTexto`/`recibidoFecha`
-- son la recepción del coche y `carpeta` es la carpeta de documentación.
--
-- Campo opcional: nunca bloquea el alta ni la publicación.
-- Aditiva e idempotente.
ALTER TABLE "Vehiculo"
  ADD COLUMN IF NOT EXISTS ubicacion TEXT;

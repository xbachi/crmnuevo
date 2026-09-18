-- Plazas y potencia en kW en la ficha comercial.
--
-- POR QUÉ: el permiso de circulación / tarjeta ITV trae S.1 (plazas) y P.2
-- (potencia en kW) y ahora el cron los rellena solo cuando el CRM no los tiene.
-- `plazas` no existía en ninguna tabla y `motor_kw` tampoco: sin ellas los dos
-- campos leídos del documento no tenían dónde caer y se perdían.
-- La potencia en CV ya vive en motor_cv y la cilindrada en cubicaje.
--
-- Aditiva e idempotente.
ALTER TABLE vehiculo_ficha_comercial
  ADD COLUMN IF NOT EXISTS plazas   INTEGER,
  ADD COLUMN IF NOT EXISTS motor_kw INTEGER;

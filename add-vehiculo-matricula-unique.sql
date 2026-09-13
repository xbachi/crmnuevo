-- Índice UNIQUE sobre la matrícula normalizada del vehículo.
--
-- Es el PASO POSTERIOR que fix-vehiculo-identidad.sql dejó escrito pero sin
-- ejecutar: cuando se escribió aquel fichero había un vehículo duplicado real
-- en producción y el índice habría fallado al crearse. Comprobado hoy con
-- scripts/check-vehiculo-dups.js contra producción: 0 duplicados. Ya se puede.
--
-- Por qué ahora: la web (sevencars.es) sincroniza el estado reservado/vendido
-- emparejando por matrícula (ver src/lib/webSync.ts). Si dos vehículos
-- compartieran matrícula, el receptor no sabría cuál marcar y responde 409 sin
-- escribir — seguro, pero deja el coche desincronizado sin que nadie se entere.
-- Este índice hace que ese caso no pueda existir, en vez de gestionarlo después.
--
-- Parcial: excluye la cadena vacía, porque `matricula` admite NULL (vehículos
-- dados de alta antes de tener la placa) y la columna generada los convierte
-- en ''. Sin el WHERE, el segundo vehículo sin matrícula fallaría al guardarse.
--
-- Idempotente. Requiere matricula_norm, que crea fix-vehiculo-identidad.sql.

CREATE UNIQUE INDEX IF NOT EXISTS uq_vehiculo_matricula_norm
  ON "Vehiculo" (matricula_norm)
  WHERE matricula_norm <> '';

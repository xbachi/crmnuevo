/** Pasos de preparación con fila en vehiculo_pasos (sin dependencias de servidor:
 *  lo importan componentes cliente). CARPETA..SEGURO viven en "Vehiculo". */
export const PASOS_VEHICULO = [
  'REVI_INIC',
  'MECAUTO',
  'REVI_PINTURA',
  'PINTURA',
  'LIMPIEZA',
  'FOTOS',
  'PUBLICADO',
] as const
export type PasoVehiculo = (typeof PASOS_VEHICULO)[number]

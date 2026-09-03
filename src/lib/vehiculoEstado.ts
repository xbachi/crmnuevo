/**
 * Estados canónicos del vehículo + máquina de transiciones.
 *
 * Los estados salen del código REAL (no inventados):
 * - Pipeline kanban (interface Vehiculo en direct-database.ts + ESTADOS en
 *   KanbanBoard.tsx): SIN_ESTADO, REVI_INIC, MECAUTO, REVI_PINTURA, PINTURA,
 *   LIMPIEZA, FOTOS, PUBLICADO, RESERVADO, VENDIDO.
 * - 'disponible' lo escribe el flujo de deals (deal borrado / vuelta a stock).
 * Aliases históricos que la UI manda hoy por PUT: 'ACTIVO' (condición
 * disponible), 'EN_STOCK' (contrato anulado), 'INICIAL' / '' (columna inicial),
 * más casings mezclados ('vendido'/'VENDIDO' conviven en prod).
 */

export const ESTADOS_VEHICULO = [
  'SIN_ESTADO',
  'REVI_INIC',
  'MECAUTO',
  'REVI_PINTURA',
  'PINTURA',
  'LIMPIEZA',
  'FOTOS',
  'PUBLICADO',
  'RESERVADO',
  'VENDIDO',
  'DISPONIBLE',
] as const

export type EstadoVehiculo = (typeof ESTADOS_VEHICULO)[number]

/** Aliases reales encontrados en el código / datos → estado canónico. */
const ALIAS_ESTADO: Record<string, EstadoVehiculo> = {
  '': 'SIN_ESTADO',
  INICIAL: 'SIN_ESTADO',
  ACTIVO: 'DISPONIBLE',
  EN_STOCK: 'DISPONIBLE',
}

/** Normaliza casing/aliases. Devuelve null si el estado no es reconocible. */
export function normalizarEstado(
  s: string | null | undefined
): EstadoVehiculo | null {
  const up = String(s ?? '')
    .trim()
    .toUpperCase()
  if ((ESTADOS_VEHICULO as readonly string[]).includes(up)) {
    return up as EstadoVehiculo
  }
  return ALIAS_ESTADO[up] ?? null
}

/** Buckets de la lista de vehículos (filtros de estado y contadores). */
export type BucketEstado =
  | 'publicados'
  | 'enProceso'
  | 'vendidos'
  | 'reservados'

/**
 * Clasifica un estado en su bucket de la lista. Todo lo que no es
 * PUBLICADO / RESERVADO / VENDIDO (preparación, DISPONIBLE, vacío/null,
 * aliases y valores no reconocibles) cae en enProceso para que ningún coche
 * desaparezca de todos los filtros.
 */
export function bucketDeEstado(
  estado: string | null | undefined
): BucketEstado {
  switch (normalizarEstado(estado)) {
    case 'PUBLICADO':
      return 'publicados'
    case 'RESERVADO':
      return 'reservados'
    case 'VENDIDO':
      return 'vendidos'
    default:
      return 'enProceso'
  }
}

/**
 * Tipo canónico del vehículo (LETRAS). El backend filtra por letra y la DB
 * debe guardar solo letras; los modales viejos guardaban PALABRAS y corrompían
 * el dato. `normalizarTipo` es el único punto que traduce cualquier variante.
 */
export type TipoVehiculo = 'C' | 'I' | 'D' | 'R' | 'M'

/** Letra canónica → label para UI. */
export const TIPO_LABEL: Record<TipoVehiculo, string> = {
  C: 'Compra',
  I: 'Inversor',
  D: 'Depósito Venta',
  R: 'Coche R',
  M: 'Venta manual',
}

/** Variantes conocidas (ya normalizadas: trim + upper) → letra canónica. */
const ALIAS_TIPO: Record<string, TipoVehiculo> = {
  C: 'C',
  COMPRA: 'C',
  I: 'I',
  INVERSOR: 'I',
  D: 'D',
  DEPOSITO: 'D',
  DEPÓSITO: 'D',
  'DEPOSITO VENTA': 'D',
  'DEPÓSITO VENTA': 'D',
  R: 'R',
  'COCHE R': 'R',
  // 'M' = venta manual sin stock (creado por api/sales/manual-issue)
  M: 'M',
  MANUAL: 'M',
  'VENTA MANUAL': 'M',
}

/**
 * Normaliza cualquier variante conocida del tipo a la letra canónica.
 * Acepta letras y palabras (con/sin tilde, case-insensitive, con espacios
 * internos colapsados). Devuelve null si el valor no es reconocible.
 */
export function normalizarTipo(
  t: string | null | undefined
): TipoVehiculo | null {
  const up = String(t ?? '')
    .trim()
    .replace(/\s+/g, ' ')
    .toUpperCase()
  return ALIAS_TIPO[up] ?? null
}

/** Label de UI para cualquier variante de tipo; valor crudo si no se reconoce. */
export function labelTipo(t: string | null | undefined): string {
  const n = normalizarTipo(t)
  return n ? TIPO_LABEL[n] : String(t ?? '')
}

/** Estados de preparación: el kanban permite moverse libremente entre ellos. */
export const ESTADOS_PREPARACION: EstadoVehiculo[] = [
  'SIN_ESTADO',
  'REVI_INIC',
  'MECAUTO',
  'REVI_PINTURA',
  'PINTURA',
  'LIMPIEZA',
  'FOTOS',
]

const VENTA_DIRECTA: EstadoVehiculo[] = ['RESERVADO', 'VENDIDO']

/**
 * Grafo de transiciones (exportado para test).
 * entrada/preparación (libre entre sí) → PUBLICADO → RESERVADO → VENDIDO,
 * con vueltas atrás donde tienen sentido: RESERVADO→PUBLICADO (se cae la
 * reserva), PUBLICADO→preparación (retoques), VENDIDO→DISPONIBLE (contrato
 * anulado). Reservar/vender directo desde preparación está permitido porque
 * la UI lo hace hoy (venta sin publicar). VENDIDO es terminal salvo anulación.
 */
export const TRANSICIONES: Record<EstadoVehiculo, EstadoVehiculo[]> = {
  SIN_ESTADO: [
    ...ESTADOS_PREPARACION,
    'PUBLICADO',
    'DISPONIBLE',
    ...VENTA_DIRECTA,
  ],
  REVI_INIC: [
    ...ESTADOS_PREPARACION,
    'PUBLICADO',
    'DISPONIBLE',
    ...VENTA_DIRECTA,
  ],
  MECAUTO: [
    ...ESTADOS_PREPARACION,
    'PUBLICADO',
    'DISPONIBLE',
    ...VENTA_DIRECTA,
  ],
  REVI_PINTURA: [
    ...ESTADOS_PREPARACION,
    'PUBLICADO',
    'DISPONIBLE',
    ...VENTA_DIRECTA,
  ],
  PINTURA: [
    ...ESTADOS_PREPARACION,
    'PUBLICADO',
    'DISPONIBLE',
    ...VENTA_DIRECTA,
  ],
  LIMPIEZA: [
    ...ESTADOS_PREPARACION,
    'PUBLICADO',
    'DISPONIBLE',
    ...VENTA_DIRECTA,
  ],
  FOTOS: [...ESTADOS_PREPARACION, 'PUBLICADO', 'DISPONIBLE', ...VENTA_DIRECTA],
  PUBLICADO: [...ESTADOS_PREPARACION, 'RESERVADO', 'VENDIDO', 'DISPONIBLE'],
  RESERVADO: ['PUBLICADO', 'VENDIDO', 'DISPONIBLE'],
  VENDIDO: ['DISPONIBLE'],
  DISPONIBLE: [...ESTADOS_PREPARACION, 'PUBLICADO', ...VENTA_DIRECTA],
}

/**
 * ¿Es válida la transición desde→hacia? Case-insensitive, acepta aliases.
 * - hacia no reconocible → false (no se escribe basura).
 * - desde no reconocible (dato sucio en DB) → true (no se puede validar;
 *   bloquear dejaría el vehículo atrapado).
 * - mismo estado normalizado → true (no-op).
 */
export function transicionValida(
  desde: string | null | undefined,
  hacia: string | null | undefined
): boolean {
  const to = normalizarEstado(hacia)
  if (!to) return false
  const from = normalizarEstado(desde)
  if (!from) return true
  if (from === to) return true
  return TRANSICIONES[from].includes(to)
}

/**
 * Whitelist de campos editables por PUT /api/vehiculos/[id].
 * Unión de lo que la UI manda hoy (páginas vehiculos, coches-r, inversores,
 * VehicleCard, detalle). Campos internos (id, orden, dealActivoId,
 * beneficioNeto, createdAt/updatedAt, matricula_norm) quedan afuera.
 */
export const CAMPOS_EDITABLES_VEHICULO = [
  'referencia',
  'marca',
  'modelo',
  'matricula',
  'bastidor',
  'kms',
  'tipo',
  'estado',
  'color',
  'año',
  'fechaMatriculacion',
  'fechaCompra',
  'itv',
  'seguro',
  'segundaLlave',
  'documentacion',
  'carpeta',
  'master',
  'hojasA',
  'esCocheInversor',
  'inversorId',
  'notasInversor',
  'fotoInversor',
  'precioCompra',
  'gastosTransporte',
  'gastosTasas',
  'gastosMecanica',
  'gastosPintura',
  'gastosLimpieza',
  'gastosOtros',
  'gastosCNGarantia',
  'precioPublicacion',
  'precioVenta',
  'garantiaPremium',
] as const

/** Filtra el body a los campos editables. Devuelve también los ignorados. */
export function filtrarCamposEditables(body: Record<string, unknown>): {
  data: Record<string, unknown>
  ignorados: string[]
} {
  const permitidos = new Set<string>(CAMPOS_EDITABLES_VEHICULO)
  const data: Record<string, unknown> = {}
  const ignorados: string[] = []
  for (const key of Object.keys(body)) {
    if (permitidos.has(key)) data[key] = body[key]
    else ignorados.push(key)
  }
  return { data, ignorados }
}

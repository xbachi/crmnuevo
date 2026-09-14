/**
 * Tipos del motor de presupuestos. Puro: sin imports, importable desde cliente.
 */

export type TarifaFinanciacion = 'NORMAL' | 'ESPECIAL' | 'SIN_DTO' | 'CONSULTAR'
export type ModoPlazo = 'NORMAL' | 'CORTO'
export type ModoEntrega = 'JUNTO' | 'SEPARADO'
export type ModoGarantia = 'LEGAL' | 'EXTENSION'
export type ColumnaClave = 'sin_premium' | 'premium'

export const PLAZOS = [120, 108, 96, 84, 72, 60, 48, 36, 24] as const
export type Plazo = (typeof PLAZOS)[number]

export const ESTADOS_PRESUPUESTO = [
  'borrador',
  'enviado',
  'visto',
  'aceptado',
  'vencido',
  'anulado',
] as const
export type EstadoPresupuesto = (typeof ESTADOS_PRESUPUESTO)[number]

export interface TarifaCalculo {
  id: number | null
  nombre: string
  coeficientes: Record<string, number>
}

export interface ParametrosPresupuesto {
  gestion: number
  tope_dto_base: number
  pct_normal: number
  pct_especial: number
  /** [limite exclusivo (<), importe]; null = resto */
  gp_bandas: Array<[number | null, number]>
  extension_umbral: number
  extension_precio_bajo: number
  extension_precio_alto: number
  validez_dias: number
  plazo_max_meses: number
  plazo_corto_max: number
  sustitucion_edad_max_meses: number
  extension_min_meses: number
  tarifa_sin_premium_id: number | null
  reserva_url_defecto: string
  ratio_aviso: number
  whatsapp_empresa: string
}

export const PARAMETROS_DEFECTO: ParametrosPresupuesto = {
  gestion: 390,
  tope_dto_base: 20000,
  pct_normal: 0.07,
  pct_especial: 0.03,
  gp_bandas: [
    [10000, 490],
    [15000, 590],
    [20000, 690],
    [30000, 790],
    [null, 990],
  ],
  extension_umbral: 20000,
  extension_precio_bajo: 690,
  extension_precio_alto: 890,
  validez_dias: 7,
  plazo_max_meses: 180,
  plazo_corto_max: 60,
  sustitucion_edad_max_meses: 83,
  extension_min_meses: 6,
  tarifa_sin_premium_id: null,
  reserva_url_defecto: 'https://www.sevencars.es',
  ratio_aviso: 0.7,
  whatsapp_empresa: '',
}

/** Snapshot del vehículo/ficha que necesita el motor (se guarda en calculo.entrada). */
export interface VehiculoCalculo {
  precio_contado: number
  tarifa_financiacion: TarifaFinanciacion | null
  gp: number | null
  /** 'YYYY-MM-DD' */
  fecha_matriculacion: string | null
  meses_garantia_fabrica: number | null
}

export interface OpcionesPresupuesto {
  financia: boolean
  modoPlazo: ModoPlazo
  /** null/0 → sin entrada */
  entrada: number | null
  cocheEntrega: { valor: number; modo: ModoEntrega } | null
  prestamoPendiente: number | null
  extra: { concepto: string; importe: number } | null
  sustitucion: 'auto' | 'si' | 'no'
  /** fuerza la tarifa (por defecto la de la ficha) */
  tarifaOverride?: TarifaFinanciacion | null
}

export const OPCIONES_DEFECTO: OpcionesPresupuesto = {
  financia: true,
  modoPlazo: 'NORMAL',
  entrada: null,
  cocheEntrega: null,
  prestamoPendiente: null,
  extra: null,
  sustitucion: 'auto',
}

export interface EntradaCalculo {
  vehiculo: VehiculoCalculo
  opciones: OpcionesPresupuesto
  params: ParametrosPresupuesto
  tarifaPremium: TarifaCalculo
  tarifaSinPremium: TarifaCalculo
  /** 'YYYY-MM-DD' (Europe/Madrid); explícito para tests deterministas */
  hoy: string
}

export type LineaClave =
  | 'contado'
  | 'entrega_vehiculo'
  | 'garantia'
  | 'gestion'
  | 'importe'
  | 'dto_financiacion'
  | 'extra'
  | 'entrada'
  | 'prestamo'
  | 'total'

export interface LineaPresupuesto {
  clave: LineaClave
  etiqueta: string
  subtitulo?: string
  importe: number
  /** true = línea de texto sin importe (ej. "12 meses Garantía Estándar") */
  sinImporte?: boolean
  visible: boolean
  tipo: 'linea' | 'subtotal' | 'total'
}

/** cuota entera; null = la tarifa no tiene coeficiente para ese plazo */
export interface CuotaPlazo {
  plazo: Plazo
  cuota: number | null
  coeficiente: number | null
}

export interface ColumnaCalculo {
  clave: ColumnaClave
  titulo: string
  tarifaNombre: string
  lineas: LineaPresupuesto[]
  importe: number
  total: number
  cuotas: CuotaPlazo[]
  desde: number | null
}

export interface ChequeoPresupuesto {
  texto: string
  ok: boolean
}

export interface GarantiaInfo {
  modo: ModoGarantia
  quedaOficial: boolean
  finFabrica: string | null
  mesesQuedan: number | null
  precioExtension: number
  /** "Garantía Oficial hasta mayo-2028" */
  textoOficial: string | null
}

/** A42..A49 de la hoja */
export interface DescuentoDetalle {
  base: number
  baseSinPct: number
  tope: number
  bruto: number
  redondeado: number
  aplicado: number
  linea: number
}

export interface ResultadoCalculo {
  hoy: string
  validoHasta: string
  entrada: { vehiculo: VehiculoCalculo; opciones: OpcionesPresupuesto }
  derivados: {
    tarifa: TarifaFinanciacion
    pct: number
    edadMeses: number
    plazoMax: number
    sustitucion: boolean
    entregaEfectiva: ModoEntrega
    gp: number
    gpOrigen: 'ficha' | 'bandas'
    garantia: GarantiaInfo
    dto: DescuentoDetalle
  }
  financiable: boolean
  plazosMostrados: Plazo[]
  columnas: { sin_premium: ColumnaCalculo; premium: ColumnaCalculo }
  checks: { sin_premium: ChequeoPresupuesto[]; premium: ChequeoPresupuesto[] }
  ratioFinanciado: number | null
  avisos: string[]
  textos: { legal: string; validez: string }
}

export const TEXTO_LEGAL =
  'Validez del precio del vehículo 7 días, salvo que no esté disponible. ' +
  'Consúltanos para confirmar disponibilidad. Financiación con valor orientativo ' +
  'y sin carácter contractual, pendiente de aprobación por parte de la entidad ' +
  'financiera. TIN, TAE y resto de datos del préstamo serán indicados una vez ' +
  'tengamos la aprobación de la entidad financiera y previos a la firma.'

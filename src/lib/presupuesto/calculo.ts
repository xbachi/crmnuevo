/**
 * Motor puro del presupuesto premium. Reproduce las fórmulas de la hoja
 * Presupuesto_2025 (ver SPEC). Sin DB, sin Date.now: `hoy` viene en la entrada.
 * Importable desde componentes cliente.
 */
import {
  PLAZOS,
  TEXTO_LEGAL,
  type ChequeoPresupuesto,
  type ColumnaCalculo,
  type ColumnaClave,
  type CuotaPlazo,
  type DescuentoDetalle,
  type EntradaCalculo,
  type GarantiaInfo,
  type LineaPresupuesto,
  type ModoEntrega,
  type ModoPlazo,
  type ParametrosPresupuesto,
  type Plazo,
  type ResultadoCalculo,
  type TarifaCalculo,
  type TarifaFinanciacion,
} from './tipos'

const MESES_ES = [
  'enero',
  'febrero',
  'marzo',
  'abril',
  'mayo',
  'junio',
  'julio',
  'agosto',
  'septiembre',
  'octubre',
  'noviembre',
  'diciembre',
]

const pad2 = (n: number) => String(n).padStart(2, '0')

function partes(ymd: string): [number, number, number] {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(ymd)
  if (!m) throw new Error(`Fecha inválida: ${ymd}`)
  return [Number(m[1]), Number(m[2]), Number(m[3])]
}

function aYMD(d: Date): string {
  return `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())}`
}

export function round2(x: number): number {
  return Math.round(x * 100) / 100
}

/** MROUND(x; 5) */
export function mround5(x: number): number {
  return Math.round(x / 5) * 5
}

/** DATEDIF(desde; hasta; "m"): meses completos. Negativo → 0. */
export function mesesEntre(desdeYMD: string, hastaYMD: string): number {
  const [y1, m1, d1] = partes(desdeYMD)
  const [y2, m2, d2] = partes(hastaYMD)
  let meses = (y2 - y1) * 12 + (m2 - m1)
  if (d2 < d1) meses -= 1
  return meses < 0 ? 0 : meses
}

/** EDATE: suma meses; el día se recorta al último del mes destino. */
export function sumarMeses(ymd: string, meses: number): string {
  const [y, m, d] = partes(ymd)
  const total = y * 12 + (m - 1) + meses
  const ty = Math.floor(total / 12)
  const tm = total - ty * 12
  const ultimoDia = new Date(Date.UTC(ty, tm + 1, 0)).getUTCDate()
  return aYMD(new Date(Date.UTC(ty, tm, Math.min(d, ultimoDia))))
}

export function sumarDias(ymd: string, dias: number): string {
  const [y, m, d] = partes(ymd)
  return aYMD(new Date(Date.UTC(y, m - 1, d + dias)))
}

/** '2025-05-10' → 'mayo-2025' */
export function mesAnioEs(ymd: string): string {
  const [y, m] = partes(ymd)
  return `${MESES_ES[m - 1]}-${y}`
}

/** 'YYYY-MM-DD' en Europe/Madrid */
export function hoyMadrid(d = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Madrid',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(d)
}

function fechaEs(ymd: string): string {
  const [y, m, d] = partes(ymd)
  return `${pad2(d)}/${pad2(m)}/${y}`
}

export function gpPorBandas(
  contado: number,
  bandas: ParametrosPresupuesto['gp_bandas']
): number {
  for (const [limite, importe] of bandas) {
    if (limite === null || contado < limite) return importe
  }
  const ultima = bandas[bandas.length - 1]
  return ultima ? ultima[1] : 0
}

export function pctDe(
  tarifa: TarifaFinanciacion,
  p: ParametrosPresupuesto
): number {
  if (tarifa === 'NORMAL') return p.pct_normal
  if (tarifa === 'ESPECIAL') return p.pct_especial
  return 0
}

export function plazosDisponibles(args: {
  financia: boolean
  tarifa: TarifaFinanciacion
  modo: ModoPlazo
  plazoMax: number
}): Plazo[] {
  const { financia, tarifa, modo, plazoMax } = args
  if (!financia || tarifa === 'CONSULTAR') return []
  const base = (n: Plazo) => plazoMax >= n
  if (tarifa === 'SIN_DTO') return PLAZOS.filter(base)
  return PLAZOS.filter((n) => {
    if (n >= 72) return modo === 'NORMAL' && base(n)
    if (n === 60)
      return modo === 'NORMAL' ? base(60) && !base(72) : base(60) && base(72)
    return modo === 'CORTO' && base(n)
  })
}

function cuotasDe(
  total: number,
  plazos: Plazo[],
  tarifa: TarifaCalculo
): CuotaPlazo[] {
  return plazos.map((plazo) => {
    const coef = tarifa.coeficientes[String(plazo)]
    const coeficiente = typeof coef === 'number' ? coef : null
    return {
      plazo,
      coeficiente,
      cuota: coeficiente === null ? null : Math.round(total * coeficiente),
    }
  })
}

export function calcularPresupuesto(e: EntradaCalculo): ResultadoCalculo {
  const { vehiculo, opciones, params, hoy } = e
  const contado = vehiculo.precio_contado
  if (!(contado > 0)) throw new Error('El vehículo no tiene precio contado')

  const avisos: string[] = []
  const tarifa: TarifaFinanciacion =
    opciones.tarifaOverride ?? vehiculo.tarifa_financiacion ?? 'CONSULTAR'
  const pct = pctDe(tarifa, params)
  const financia = opciones.financia
  const financiable = financia && tarifa !== 'CONSULTAR'
  if (financia && tarifa === 'CONSULTAR') {
    avisos.push('Tarifa CONSULTAR: financiación no calculada')
  }

  const fm = vehiculo.fecha_matriculacion
  let edadMeses = 0
  if (fm) edadMeses = mesesEntre(fm, hoy)
  else avisos.push('Sin fecha de matriculación: se asume 0 meses')
  const plazoMax = params.plazo_max_meses - edadMeses

  const sustitucion =
    opciones.sustitucion === 'auto'
      ? edadMeses < params.sustitucion_edad_max_meses
      : opciones.sustitucion === 'si'

  const garantia = garantiaDe(vehiculo, params, hoy)
  const gp = vehiculo.gp ?? gpPorBandas(contado, params.gp_bandas)
  const gpOrigen = vehiculo.gp != null ? 'ficha' : 'bandas'

  const coche = opciones.cocheEntrega
  const valorCoche = coche?.valor ?? 0
  const entrada = opciones.entrada ?? 0
  const prestamo = opciones.prestamoPendiente ?? 0
  const entregaEfectiva: ModoEntrega =
    tarifa === 'SIN_DTO' ||
    opciones.modoPlazo === 'CORTO' ||
    !financiable ||
    !coche
      ? 'SEPARADO'
      : coche.modo

  // A42..A49
  const base = contado - entrada - valorCoche + prestamo
  const baseSinPct = base / (1 + pct)
  const tope = pct * params.tope_dto_base
  const bruto = Math.min(baseSinPct * pct, tope)
  const redondeado = mround5(bruto)
  const a47 = opciones.modoPlazo === 'CORTO' ? 0 : redondeado
  const aplicado = financiable ? a47 : 0
  const linea = entregaEfectiva === 'JUNTO' ? aplicado + valorCoche : aplicado
  const dto: DescuentoDetalle = {
    base,
    baseSinPct,
    tope,
    bruto,
    redondeado,
    aplicado,
    linea,
  }

  const plazosMostrados = plazosDisponibles({
    financia,
    tarifa,
    modo: opciones.modoPlazo,
    plazoMax,
  })

  const comun = {
    contado,
    coche,
    entregaEfectiva,
    financiable,
    dto,
    gestion: params.gestion,
    extra: opciones.extra,
    entrada,
    prestamo,
    plazos: plazosMostrados,
  }
  const sinPremium = columnaDe('sin_premium', {
    ...comun,
    titulo: 'Sin Garantía Premium',
    tarifa: e.tarifaSinPremium,
    garantiaLinea:
      garantia.modo === 'EXTENSION'
        ? null
        : {
            etiqueta: '12 meses Garantía Estándar',
            importe: 0,
            sinImporte: true,
          },
  })
  const premium = columnaDe('premium', {
    ...comun,
    titulo: 'Con Garantía Premium',
    tarifa: e.tarifaPremium,
    garantiaLinea:
      garantia.modo === 'EXTENSION'
        ? {
            etiqueta: 'Extensión GARANTIA PREMIUM',
            importe: garantia.precioExtension,
          }
        : {
            etiqueta: 'GARANTIA PREMIUM',
            subtitulo: 'en Servicio Oficial de 1 año',
            importe: gp,
          },
  })

  if (
    financiable &&
    sinPremium.cuotas.every((c) => c.cuota === null) &&
    premium.cuotas.every((c) => c.cuota === null)
  ) {
    avisos.push('Sin plazos disponibles para la edad del vehículo')
  }

  const ratioFinanciado = financiable
    ? sinPremium.total / (contado - aplicado + params.gestion)
    : null
  if (ratioFinanciado !== null && ratioFinanciado > params.ratio_aviso) {
    avisos.push('FINANCIA MÁS 70%')
  }

  const validoHasta = sumarDias(hoy, params.validez_dias)

  return {
    hoy,
    validoHasta,
    entrada: { vehiculo, opciones },
    derivados: {
      tarifa,
      pct,
      edadMeses,
      plazoMax,
      sustitucion,
      entregaEfectiva,
      gp,
      gpOrigen,
      garantia,
      dto,
    },
    financiable,
    plazosMostrados,
    columnas: { sin_premium: sinPremium, premium },
    checks: checksDe(financiable, sustitucion, garantia.modo === 'EXTENSION'),
    ratioFinanciado,
    avisos,
    textos: {
      legal: TEXTO_LEGAL,
      validez: `Presupuesto válido hasta el ${fechaEs(validoHasta)}`,
    },
  }
}

function garantiaDe(
  v: EntradaCalculo['vehiculo'],
  p: ParametrosPresupuesto,
  hoy: string
): GarantiaInfo {
  const precioExtension =
    v.precio_contado < p.extension_umbral
      ? p.extension_precio_bajo
      : p.extension_precio_alto
  if (v.fecha_matriculacion && v.meses_garantia_fabrica) {
    const finFabrica = sumarMeses(
      v.fecha_matriculacion,
      v.meses_garantia_fabrica
    )
    const quedaOficial = hoy <= finFabrica
    const mesesQuedan = quedaOficial ? mesesEntre(hoy, finFabrica) : 0
    return {
      modo:
        quedaOficial && mesesQuedan > p.extension_min_meses
          ? 'EXTENSION'
          : 'LEGAL',
      quedaOficial,
      finFabrica,
      mesesQuedan,
      precioExtension,
      textoOficial: quedaOficial
        ? `Garantía Oficial hasta ${mesAnioEs(finFabrica)}`
        : null,
    }
  }
  return {
    modo: 'LEGAL',
    quedaOficial: false,
    finFabrica: null,
    mesesQuedan: null,
    precioExtension,
    textoOficial: null,
  }
}

interface ArgsColumna {
  titulo: string
  tarifa: TarifaCalculo
  garantiaLinea: {
    etiqueta: string
    subtitulo?: string
    importe: number
    sinImporte?: boolean
  } | null
  contado: number
  coche: { valor: number; modo: ModoEntrega } | null
  entregaEfectiva: ModoEntrega
  financiable: boolean
  dto: DescuentoDetalle
  gestion: number
  extra: { concepto: string; importe: number } | null
  entrada: number
  prestamo: number
  plazos: Plazo[]
}

function columnaDe(clave: ColumnaClave, a: ArgsColumna): ColumnaCalculo {
  const lineas: LineaPresupuesto[] = []
  const linea = (
    l: Omit<LineaPresupuesto, 'tipo'> & Partial<Pick<LineaPresupuesto, 'tipo'>>
  ) => {
    lineas.push({ tipo: 'linea', ...l, importe: round2(l.importe) })
  }
  const sumaVisible = (claves: LineaPresupuesto['clave'][]) =>
    round2(
      lineas
        .filter((l) => l.visible && claves.includes(l.clave))
        .reduce((s, l) => s + l.importe, 0)
    )

  linea({
    clave: 'contado',
    etiqueta: 'Precio contado',
    importe: a.contado,
    visible: true,
  })
  linea({
    clave: 'entrega_vehiculo',
    etiqueta: 'Entrega Vehículo',
    importe: -(a.coche?.valor ?? 0),
    visible: !!a.coche && a.entregaEfectiva !== 'JUNTO',
  })
  if (a.garantiaLinea) {
    linea({ clave: 'garantia', visible: true, ...a.garantiaLinea })
  }
  linea({
    clave: 'gestion',
    etiqueta: 'Gestión y Preparación',
    importe: a.gestion,
    visible: true,
  })
  const importe = sumaVisible([
    'contado',
    'entrega_vehiculo',
    'garantia',
    'gestion',
  ])
  linea({
    clave: 'importe',
    etiqueta: 'Importe',
    importe,
    visible: true,
    tipo: 'subtotal',
  })

  linea({
    clave: 'dto_financiacion',
    etiqueta:
      a.entregaEfectiva === 'JUNTO'
        ? 'Entrega Vehículo y Descuento Financiación'
        : 'Descuento Financiación',
    importe: -a.dto.linea,
    visible: a.financiable && a.dto.linea > 0,
  })
  linea({
    clave: 'extra',
    etiqueta: a.extra?.concepto ?? 'Extra',
    importe: a.extra?.importe ?? 0,
    visible: !!a.extra && a.extra.importe !== 0,
  })
  linea({
    clave: 'entrada',
    etiqueta: 'Entrada',
    importe: -a.entrada,
    visible: a.entrada > 0,
  })
  linea({
    clave: 'prestamo',
    etiqueta: 'Préstamo Pendiente',
    importe: a.prestamo,
    visible: a.prestamo > 0,
  })
  const total = sumaVisible([
    'importe',
    'dto_financiacion',
    'extra',
    'entrada',
    'prestamo',
  ])
  linea({
    clave: 'total',
    etiqueta: a.financiable ? 'Importe a Financiar' : 'Total',
    importe: total,
    visible: true,
    tipo: 'total',
  })

  const cuotas = cuotasDe(total, a.plazos, a.tarifa)
  const conCuota = cuotas
    .filter((c) => c.cuota !== null)
    .map((c) => c.cuota as number)
  return {
    clave,
    titulo: a.titulo,
    tarifaNombre: a.tarifa.nombre,
    lineas,
    importe,
    total,
    cuotas,
    desde: conCuota.length ? Math.min(...conCuota) : null,
  }
}

function checksDe(
  financiable: boolean,
  sustitucion: boolean,
  extension: boolean
): ResultadoCalculo['checks'] {
  const seguro: ChequeoPresupuesto = {
    texto: 'Seguro protección del préstamo',
    ok: true,
  }
  return {
    sin_premium: [
      {
        texto: extension
          ? 'Sin Extensión Garantía Premium'
          : 'Sin Garantía Premium',
        ok: false,
      },
      ...(financiable
        ? [{ texto: '24 meses de permanencia', ok: false }, seguro]
        : []),
    ],
    premium: [
      {
        texto: extension
          ? 'Exten. Garantía Premium en S.Oficial 1 año'
          : 'Garantía Premium en Servicio Oficial 1 año',
        ok: true,
      },
      ...(financiable
        ? [{ texto: 'Posibilidad de adelantar dinero', ok: true }, seguro]
        : []),
      ...(sustitucion
        ? [{ texto: 'Con vehículo de sustitución', ok: true }]
        : []),
    ],
  }
}

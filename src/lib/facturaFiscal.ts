/**
 * Piezas puras de la capa fiscal de una factura de proveedor (sin pg, testeables).
 *
 * Existe por un incidente real: en julio entraron importes de 47.104 € y 156.372 €
 * porque el extractor tomaba "el número más grande del PDF". Nada los cuestionaba.
 * `chequearMatematica` es ese guard: si las líneas no cuadran con el importe
 * declarado, el documento se registra igual pero NUNCA como `validada`.
 *
 * Regla que atraviesa todo el módulo: perder el documento es peor que registrarlo
 * dudoso. Nada acá lanza; los problemas viajan como `errores[]` y degradan el estado.
 */

import { parseImporte } from './gastoImporte'

export const TIPOS_LINEA = ['iva', 'exenta', 'isp', 'suplido', 'retencion', 'rebu'] as const
export type TipoLinea = (typeof TIPOS_LINEA)[number]

export const DEDUCIBLES_LINEA = ['si', 'no', 'parcial'] as const
export type DeducibleLinea = (typeof DEDUCIBLES_LINEA)[number]

// Dominios de la cabecera. Espejo EXACTO de los CHECK chk_fr_tipo_operacion /
// chk_fr_deducible: un valor fuera de acá revienta el INSERT (→ 500 → factura
// perdida), así que se filtran antes de llegar a la DB.
export const TIPOS_OPERACION = [
  'interior', 'intracomunitaria', 'importacion', 'isp', 'exenta', 'rebu-compra', 'suplido',
] as const
export type TipoOperacion = (typeof TIPOS_OPERACION)[number]

export const DEDUCIBLES = ['si', 'no', 'parcial', 'duda'] as const
export type Deducible = (typeof DEDUCIBLES)[number]

/**
 * Una línea del desglose. Convención de signos y de qué suma al TOTAL PAGADO
 * (documentada acá porque es la fuente de todos los malentendidos):
 *
 *  · iva      → suma base + cuota.  cuota ≈ base × tipoIva/100.
 *  · exenta   → suma base + cuota (cuota normalmente 0).
 *  · rebu     → suma base + cuota. En REBU la compra no lleva IVA deducible: cuota 0.
 *  · isp      → suma SOLO base. La cuota es autorepercutida (inversión del sujeto
 *               pasivo): el emisor no la cobra, la declara el receptor en devengado
 *               y deducido a la vez. Informativa → no entra en el total ni en
 *               `cuotaTotal`, pero SÍ se valida contra base × tipoIva/100.
 *  · suplido  → suma SOLO base. Es dinero adelantado por cuenta del cliente: se
 *               paga, pero queda fuera de la base imponible.
 *  · retencion → RESTA `cuota`. Convención: en una línea de retención `base` es la
 *               base de cálculo del IRPF (la MISMA que ya declaró la línea de IVA,
 *               por eso no vuelve a sumar ni entra en `baseTotal`: sería contarla
 *               dos veces) y `cuota` es el IMPORTE RETENIDO, que se descuenta de lo
 *               que se paga. `retencionPct` permite validar cuota ≈ base × pct/100.
 */
export interface LineaFiscal {
  orden: number
  tipoLinea: TipoLinea
  tipoIva: number | null
  base: number
  cuota: number
  retencionPct?: number | null
  concepto?: string | null
  deducible?: DeducibleLinea | null
}

const round2 = (n: number): number => Math.round((n + Number.EPSILON) * 100) / 100

/** Importe en formato es_ES para los mensajes de error (los lee un humano). */
const fmt = (n: number): string => n.toFixed(2).replace('.', ',')

/** Porcentaje sin ceros de relleno: 21 → "21", 10.5 → "10,5". */
const fmtPct = (n: number): string => String(n).replace('.', ',')

function parseNum(v: unknown): number | null {
  if (v == null || v === '') return null
  const n = typeof v === 'number' ? v : parseFloat(String(v).replace(',', '.'))
  return Number.isFinite(n) ? n : null
}

/**
 * Normaliza el array de líneas del body de n8n.
 *
 * Nunca lanza y nunca deja pasar un valor que viole un CHECK de la DB: una línea
 * con `tipoLinea` desconocido o `base` impresentable se DESCARTA con un error en
 * vez de reventar el INSERT (si el INSERT falla, se pierde la factura entera).
 * El descarte desbalancea el cuadre → `chequearMatematica` lo detecta → el
 * documento queda `pendiente-validar`. Basura visible, no basura silenciosa.
 *
 * Entrada no-array o vacía → `{lineas: [], errores: []}` (sin ruido: el body viejo
 * de n8n simplemente no manda líneas).
 */
export function parseLineas(raw: unknown): { lineas: LineaFiscal[]; errores: string[] } {
  const errores: string[] = []
  if (!Array.isArray(raw) || raw.length === 0) return { lineas: [], errores }

  const lineas: LineaFiscal[] = []
  const usados = new Set<number>()
  let siguiente = 1
  const proximoLibre = (): number => {
    while (usados.has(siguiente)) siguiente++
    return siguiente
  }

  raw.forEach((item, i) => {
    const o = (item ?? {}) as Record<string, unknown>
    const etiqueta = i + 1 // para errores previos a fijar el orden

    // ── orden: respetamos el del body, pero jamás repetido (UNIQUE(registro_id, orden))
    const ordenPedido = parseNum(o.orden)
    let orden: number
    if (ordenPedido != null && Number.isInteger(ordenPedido) && ordenPedido > 0) {
      if (usados.has(ordenPedido)) {
        errores.push(`línea ${etiqueta}: orden ${ordenPedido} duplicado, reasignado`)
        orden = proximoLibre()
      } else {
        orden = ordenPedido
      }
    } else {
      orden = proximoLibre()
    }
    usados.add(orden)

    // ── tipoLinea: contra el CHECK. Desconocido → se descarta la línea.
    const tipoRaw = String(o.tipoLinea ?? 'iva').toLowerCase().trim()
    if (!(TIPOS_LINEA as readonly string[]).includes(tipoRaw)) {
      errores.push(
        `línea ${orden}: tipoLinea inválido "${tipoRaw}" (válidos: ${TIPOS_LINEA.join(', ')}); línea descartada`
      )
      return
    }
    const tipoLinea = tipoRaw as TipoLinea

    // ── base: obligatoria (NOT NULL en la DB). No parseable → se descarta.
    const base = parseImporte(o.base)
    if (base == null) {
      errores.push(`línea ${orden}: base no parseable (${JSON.stringify(o.base ?? null)}); línea descartada`)
      return
    }

    // ── cuota: ausente = 0. Presente pero impresentable → 0 + error (la línea se
    //    conserva: la base es el dato caro, y el cuadre va a delatar el 0).
    let cuota = 0
    if (o.cuota != null && o.cuota !== '') {
      const c = parseImporte(o.cuota)
      if (c == null) errores.push(`línea ${orden}: cuota no parseable (${JSON.stringify(o.cuota)}); asumida 0`)
      else cuota = c
    }

    const tipoIva = parseNum(o.tipoIva)
    if (o.tipoIva != null && o.tipoIva !== '' && tipoIva == null) {
      errores.push(`línea ${orden}: tipoIva no parseable (${JSON.stringify(o.tipoIva)})`)
    }

    const retencionPct = parseNum(o.retencionPct)
    if (o.retencionPct != null && o.retencionPct !== '' && retencionPct == null) {
      errores.push(`línea ${orden}: retencionPct no parseable (${JSON.stringify(o.retencionPct)})`)
    }

    let deducible: DeducibleLinea | null = null
    if (o.deducible != null && o.deducible !== '') {
      const d = String(o.deducible).toLowerCase().trim()
      if ((DEDUCIBLES_LINEA as readonly string[]).includes(d)) deducible = d as DeducibleLinea
      else errores.push(`línea ${orden}: deducible inválido "${d}" (válidos: ${DEDUCIBLES_LINEA.join(', ')}); ignorado`)
    }

    const concepto = o.concepto != null && o.concepto !== '' ? String(o.concepto).trim() : null

    lineas.push({
      orden,
      tipoLinea,
      tipoIva,
      base: round2(base),
      cuota: round2(cuota),
      retencionPct,
      concepto,
      deducible,
    })
  })

  lineas.sort((a, b) => a.orden - b.orden)
  return { lineas, errores }
}

export interface ChequeoMatematico {
  ok: boolean
  /** Σ base de todas las líneas MENOS las de retención (su base ya la contó la línea de IVA). */
  baseTotal: number
  /** Σ cuota de líneas iva/exenta/rebu. ISP excluido: es autorepercutida, no soportada. */
  cuotaTotal: number
  /** Total que se debería PAGAR según las líneas. */
  calculado: number
  declarado: number | null
  /** calculado − declarado. null si no hay importe declarado. */
  diferencia: number | null
  errores: string[]
}

/**
 * El guard que impide que entre basura.
 *
 * Comprueba (a) que cada cuota se derive de su base y su tipo, y (b) que la suma
 * de las líneas reproduzca el importe declarado. `tolerancia` existe porque cada
 * proveedor redondea distinto: un cuadre exacto rechazaría facturas correctas.
 *
 * Sin líneas → `ok: false`, pero sólo con el error 'sin líneas' si HAY un importe
 * que cuadrar. El body viejo de n8n (sin líneas ni importe) no debe generar ruido.
 */
export function chequearMatematica(
  lineas: LineaFiscal[],
  importeDeclarado: number | null,
  tolerancia = 0.02
): ChequeoMatematico {
  const declarado = importeDeclarado ?? null

  if (!lineas || lineas.length === 0) {
    return {
      ok: false,
      baseTotal: 0,
      cuotaTotal: 0,
      calculado: 0,
      declarado,
      diferencia: null,
      errores: declarado != null ? ['sin líneas'] : [],
    }
  }

  const errores: string[] = []
  let baseTotal = 0
  let cuotaTotal = 0
  let calculado = 0

  for (const l of lineas) {
    if (l.tipoLinea === 'retencion') {
      // La base de la retención ya la aportó la línea de IVA: no vuelve a sumar.
      if (l.retencionPct != null) {
        const esperado = round2((l.base * l.retencionPct) / 100)
        if (Math.abs(l.cuota - esperado) > tolerancia) {
          errores.push(
            `línea ${l.orden}: retención ${fmt(l.cuota)} no cuadra con base ${fmt(l.base)} × ${fmtPct(l.retencionPct)}% (esperado ${fmt(esperado)})`
          )
        }
      }
      calculado -= l.cuota
      continue
    }

    baseTotal += l.base

    if (l.tipoLinea === 'iva' || l.tipoLinea === 'isp') {
      if (l.tipoIva == null) {
        errores.push(`línea ${l.orden}: falta tipoIva en una línea de tipo ${l.tipoLinea}`)
      } else {
        const esperado = round2((l.base * l.tipoIva) / 100)
        if (Math.abs(l.cuota - esperado) > tolerancia) {
          errores.push(
            `línea ${l.orden}: cuota ${fmt(l.cuota)} no cuadra con base ${fmt(l.base)} × ${fmtPct(l.tipoIva)}% (esperado ${fmt(esperado)})`
          )
        }
      }
    }

    if (l.tipoLinea === 'isp' || l.tipoLinea === 'suplido') {
      // ISP: cuota autorepercutida, no se paga. Suplido: fuera de base imponible.
      calculado += l.base
    } else {
      cuotaTotal += l.cuota
      calculado += l.base + l.cuota
    }
  }

  baseTotal = round2(baseTotal)
  cuotaTotal = round2(cuotaTotal)
  calculado = round2(calculado)

  let diferencia: number | null = null
  if (declarado != null) {
    diferencia = round2(calculado - declarado)
    if (Math.abs(diferencia) > tolerancia) {
      errores.push(
        `el total calculado ${fmt(calculado)} no cuadra con el importe declarado ${fmt(declarado)} (diferencia ${fmt(diferencia)})`
      )
    }
  }

  return { ok: errores.length === 0, baseTotal, cuotaTotal, calculado, declarado, diferencia, errores }
}

export interface DecidirEstadoArgs {
  tieneLineas: boolean
  mathOk: boolean
  confianza: number | null
  /** null = "no sé" (no hay NIF por ningún lado). Distinto de false = "es inválido". */
  nifValido: boolean | null
  proveedorConocido: boolean
  validacionAuto: boolean
  deducible: string
}

/**
 * Estado del documento al registrarlo. El orden de las reglas ES la regla.
 *
 * Sin líneas → `registrada`: el comportamiento de siempre y la verdad de las ~183
 * filas de 2026 (existen como archivo, sin datos fiscales). Se evalúa PRIMERO
 * porque `chequearMatematica` devuelve ok:false sin líneas, y esa no es una
 * factura mala: es una factura sin extraer.
 *
 * Auto-validar exige que TODO esté bien a la vez (proveedor de confianza,
 * extracción casi segura, cuadre exacto, NIF verificado y deducibilidad decidida).
 * Con math KO nunca se llega a `validada`.
 */
export function decidirEstado(args: DecidirEstadoArgs): { estado: string; datosIncompletos: boolean } {
  const confianza = args.confianza ?? 0

  if (!args.tieneLineas) return { estado: 'registrada', datosIncompletos: false }

  if (!args.mathOk) return { estado: 'pendiente-validar', datosIncompletos: true }

  // `proveedorConocido` es redundante en producción (validacionAuto sale de la
  // ficha del proveedor, así que sin ficha es false), pero se exige igual: nada
  // se auto-valida sin un proveedor identificado, aunque a alguien se le ocurra
  // pasar validacionAuto:true desde otro lado.
  if (
    args.validacionAuto &&
    args.proveedorConocido &&
    confianza >= 0.95 &&
    args.nifValido === true &&
    args.deducible !== 'duda'
  ) {
    return { estado: 'validada', datosIncompletos: false }
  }

  if (confianza >= 0.8 && args.proveedorConocido) {
    return { estado: 'extraida', datosIncompletos: false }
  }

  return { estado: 'pendiente-validar', datosIncompletos: false }
}

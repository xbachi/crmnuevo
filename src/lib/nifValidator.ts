/**
 * Validación de NIF/CIF/NIE españoles y NIF-IVA intracomunitario (solo formato).
 *
 * Motivación: hoy nada valida el identificador fiscal — `invoices.buyer_nif_cif`
 * es nullable y se copia crudo de `Cliente.dni`. Una factura con NIF mal tecleado
 * la rechaza la AEAT en el 347/modelo 303 y hay que rectificar.
 *
 * v1 valida ESTRUCTURA (dígito/letra de control), no existencia: un NIF puede ser
 * estructuralmente válido y no estar dado de alta. Para intracomunitarios solo se
 * comprueba el formato por país; la verificación online contra VIES queda fuera de
 * v1 (requiere red y el servicio se cae seguido — no puede bloquear una emisión).
 *
 * Nunca lanza: lo consume un webhook, entrada basura → {valido:false, motivo}.
 */

export type TipoNif = 'dni' | 'nie' | 'cif' | 'nif-iva-ue' | 'desconocido'

export interface ResultadoNif {
  valido: boolean
  tipo: TipoNif
  normalizado: string
  motivo?: string
}

const LETRAS_DNI = 'TRWAGMYFPDXBNJZSQVHLCKE'

// Letra inicial del CIF → naturaleza del carácter de control.
// 'numero': solo dígito | 'letra': solo letra | 'ambos': cualquiera de los dos.
const CIF_CONTROL: Record<string, 'numero' | 'letra' | 'ambos'> = {
  A: 'numero', B: 'numero', E: 'numero', H: 'numero',
  K: 'letra', P: 'letra', Q: 'letra', R: 'letra', S: 'letra', N: 'letra', W: 'letra',
  C: 'ambos', D: 'ambos', F: 'ambos', G: 'ambos', J: 'ambos',
  L: 'ambos', M: 'ambos', U: 'ambos', V: 'ambos',
}

const CIF_LETRAS_CONTROL = 'JABCDEFGHI'

// Formato del NIF-IVA por país (sin el chequeo de control nacional, que varía).
const FORMATO_IVA_UE: Record<string, RegExp> = {
  AT: /^ATU\d{8}$/,
  BE: /^BE0?\d{9}$/,
  DE: /^DE\d{9}$/,
  DK: /^DK\d{8}$/,
  FR: /^FR[A-Z0-9]{2}\d{9}$/,
  IE: /^IE(\d{7}[A-W]|\d[A-Z*+]\d{5}[A-W]|\d{7}[A-W][AH])$/,
  IT: /^IT\d{11}$/,
  LU: /^LU\d{8}$/,
  NL: /^NL\d{9}B\d{2}$/,
  PL: /^PL\d{10}$/,
  PT: /^PT\d{9}$/,
  SE: /^SE\d{12}$/,
  ES: /^ES[A-Z0-9]\d{7}[A-Z0-9]$/,
}

/** Mayúsculas, sin espacios, guiones ni puntos. */
export function normalizarNif(nif: string): string {
  return String(nif ?? '')
    .toUpperCase()
    .replace(/[\s.\-/]/g, '')
}

/** Letra de control esperada para los 8 dígitos de un DNI. */
function letraDni(numero: number): string {
  return LETRAS_DNI[numero % 23]
}

/** 8 dígitos + letra de control (módulo 23). */
export function validarDNI(nif: string): boolean {
  const n = normalizarNif(nif)
  const m = /^(\d{8})([A-Z])$/.exec(n)
  if (!m) return false
  return m[2] === letraDni(parseInt(m[1], 10))
}

/** X/Y/Z → 0/1/2 y mismo módulo 23 que el DNI. */
export function validarNIE(nif: string): boolean {
  const n = normalizarNif(nif)
  const m = /^([XYZ])(\d{7})([A-Z])$/.exec(n)
  if (!m) return false
  const numero = parseInt(String('XYZ'.indexOf(m[1])) + m[2], 10)
  return m[3] === letraDni(numero)
}

/** Dígito de control del CIF a partir de sus 7 dígitos centrales. */
function controlCif(digitos: string): number {
  let suma = 0
  for (let i = 0; i < 7; i++) {
    const d = digitos.charCodeAt(i) - 48
    if (i % 2 === 0) {
      // posición impar (1ª,3ª,5ª,7ª): se duplica y se suman las cifras del producto
      const doble = d * 2
      suma += doble > 9 ? doble - 9 : doble
    } else {
      suma += d
    }
  }
  return (10 - (suma % 10)) % 10
}

/** Letra de entidad + 7 dígitos + control (numérico, alfabético o ambos según la letra). */
export function validarCIF(nif: string): boolean {
  const n = normalizarNif(nif)
  const m = /^([A-Z])(\d{7})([0-9A-J])$/.exec(n)
  if (!m) return false
  const modo = CIF_CONTROL[m[1]]
  if (!modo) return false

  const control = controlCif(m[2])
  const esperadoNum = String(control)
  const esperadoLetra = CIF_LETRAS_CONTROL[control]

  if (modo === 'numero') return m[3] === esperadoNum
  if (modo === 'letra') return m[3] === esperadoLetra
  return m[3] === esperadoNum || m[3] === esperadoLetra
}

/** Solo FORMATO por país (sin VIES). El prefijo de país sale del propio NIF. */
export function validarNifIvaUE(nif: string): boolean {
  const n = normalizarNif(nif)
  const pais = n.slice(0, 2)
  const re = FORMATO_IVA_UE[pais]
  return re ? re.test(n) : false
}

/** Motivo del fallo de un identificador español con forma reconocible. */
function motivoEspanol(n: string): string {
  const dni = /^(\d{8})([A-Z])$/.exec(n)
  if (dni) return `letra de control incorrecta: esperada ${letraDni(parseInt(dni[1], 10))}`

  const nie = /^([XYZ])(\d{7})([A-Z])$/.exec(n)
  if (nie) {
    const numero = parseInt(String('XYZ'.indexOf(nie[1])) + nie[2], 10)
    return `letra de control incorrecta: esperada ${letraDni(numero)}`
  }

  const cif = /^([A-Z])(\d{7})([0-9A-J])$/.exec(n)
  if (cif) {
    const modo = CIF_CONTROL[cif[1]]
    if (!modo) return `letra de entidad no válida para un CIF: ${cif[1]}`
    const control = controlCif(cif[2])
    const esperado =
      modo === 'numero'
        ? String(control)
        : modo === 'letra'
          ? CIF_LETRAS_CONTROL[control]
          : `${control} o ${CIF_LETRAS_CONTROL[control]}`
    return `carácter de control incorrecto: esperado ${esperado}`
  }

  return 'formato no reconocido'
}

/**
 * Dispatcher. `pais` distinto de 'ES' → se valida como NIF-IVA intracomunitario
 * (solo formato). Para 'ES' se prueba DNI, NIE y CIF según la forma del texto.
 */
export function validarNif(nif: string | null | undefined, pais = 'ES'): ResultadoNif {
  const normalizado = normalizarNif(nif ?? '')
  if (!normalizado) return { valido: false, tipo: 'desconocido', normalizado: '', motivo: 'vacío' }

  if ((pais ?? 'ES').toUpperCase() !== 'ES') {
    const valido = validarNifIvaUE(normalizado)
    return {
      valido,
      tipo: 'nif-iva-ue',
      normalizado,
      motivo: valido ? undefined : `formato de NIF-IVA no válido para ${pais}`,
    }
  }

  if (validarDNI(normalizado)) return { valido: true, tipo: 'dni', normalizado }
  if (validarNIE(normalizado)) return { valido: true, tipo: 'nie', normalizado }
  if (validarCIF(normalizado)) return { valido: true, tipo: 'cif', normalizado }

  // Tipo tentativo por la forma, para que el motivo sea accionable.
  const tipo: TipoNif = /^\d{8}[A-Z]$/.test(normalizado)
    ? 'dni'
    : /^[XYZ]\d{7}[A-Z]$/.test(normalizado)
      ? 'nie'
      : /^[A-Z]\d{7}[0-9A-J]$/.test(normalizado)
        ? 'cif'
        : 'desconocido'

  return { valido: false, tipo, normalizado, motivo: motivoEspanol(normalizado) }
}

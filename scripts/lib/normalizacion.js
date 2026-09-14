// Normalización pura de referencia y matrícula (sin require: lo consumen
// src/lib/normalizacion.ts y los scripts CLI). Espejo del SQL de matricula_norm:
// UPPER(REGEXP_REPLACE(COALESCE(matricula,''),'[[:space:].-]','','g')).

const RE_ACTUAL = /^\d{4}[BCDFGHJKLMNPRSTVWXYZ]{3}$/
const RE_PROVINCIAL = /^[A-Z]{1,2}\d{4}[A-Z]{1,2}$/

const pad2 = (n) => String(n).padStart(2, '0')

/**
 * Letra D/R de un tipo de vehículo (letra o palabra legacy); null para el resto.
 * @param {unknown} tipo
 * @returns {'D'|'R'|null}
 */
function letraTipo(tipo) {
  const t = String(tipo ?? '')
    .trim()
    .replace(/\s+/g, ' ')
    .toUpperCase()
  if (t === 'D' || t === 'DEPOSITO' || t === 'DEPÓSITO') return 'D'
  if (t === 'DEPOSITO VENTA' || t === 'DEPÓSITO VENTA') return 'D'
  if (t === 'R' || t === 'COCHE R') return 'R'
  return null
}

// Nº de carpeta del rango numérico legacy: 1000-1099 → 0-99, 1100-1199 → 100-199.
function numeroCarpeta(n) {
  if (n >= 1000 && n <= 1099) return n % 100
  if (n >= 1100 && n <= 1199) return 100 + (n % 100)
  return null
}

/**
 * Referencia canónica: '#NNNN' (C/I/M/sin tipo) o '#D-NN' / '#R-NN'.
 * La letra del input prevalece sobre `tipo`; 'C-n' viejo es depósito.
 * @param {unknown} input
 * @param {unknown} [tipo]
 * @returns {string|null}
 */
function normalizarReferencia(input, tipo) {
  const s = String(input ?? '')
    .trim()
    .toUpperCase()
    .replace(/[\s.]/g, '')
    .replace(/^#/, '')
  if (!s) return null

  const m = /^([DRC])-?(\d+)$/.exec(s)
  if (m) {
    const letra = m[1] === 'C' ? 'D' : m[1]
    return `#${letra}-${pad2(parseInt(m[2], 10))}`
  }

  if (!/^\d+$/.test(s)) return null
  const n = parseInt(s, 10)
  const t = letraTipo(tipo)
  if (!t) return `#${n}`
  // Depósito/R con numeración legacy '#1038' → carpeta 38 → '#D-38'.
  const carpeta = numeroCarpeta(n)
  return `#${t}-${pad2(carpeta ?? n)}`
}

/**
 * @param {unknown} input
 * @returns {string}
 */
function normalizarMatricula(input) {
  return String(input ?? '')
    .replace(/[\s.\-]/g, '')
    .toUpperCase()
}

/**
 * Borde de entrada: 'Alemana/4994NLH' → '4994NLH' si el último segmento es
 * una matrícula española válida; si no, la cadena completa normalizada.
 * @param {unknown} input
 * @returns {string}
 */
function extraerMatriculaEntrada(input) {
  const norm = normalizarMatricula(input)
  if (!norm.includes('/')) return norm
  const ultimo = norm.slice(norm.lastIndexOf('/') + 1)
  return validarMatricula(ultimo).ok ? ultimo : norm
}

/**
 * @param {string} norm matrícula ya normalizada
 * @param {{ extranjera?: boolean }} [opts]
 * @returns {{ ok: boolean, formato: 'actual'|'provincial'|'extranjera'|'invalida' }}
 */
function validarMatricula(norm, opts) {
  const s = String(norm ?? '')
  if (RE_ACTUAL.test(s)) return { ok: true, formato: 'actual' }
  if (RE_PROVINCIAL.test(s)) return { ok: true, formato: 'provincial' }
  if (opts && opts.extranjera === true && s !== '') {
    return { ok: true, formato: 'extranjera' }
  }
  return { ok: false, formato: 'invalida' }
}

/**
 * Nº de carpeta de expediente a partir de la referencia; null si no mapea.
 * @param {unknown} referencia
 * @param {{ pad?: boolean }} [opts]
 * @returns {string|null}
 */
function refCarpeta(referencia, opts) {
  const pad = !opts || opts.pad !== false
  const c = normalizarReferencia(referencia)
  if (!c) return null

  const conLetra = /^#([DR])-(\d+)$/.exec(c)
  if (conLetra) {
    const n = parseInt(conLetra[2], 10)
    return `${conLetra[1]}-${pad ? pad2(n) : n}`
  }

  const n = numeroCarpeta(parseInt(c.slice(1), 10))
  if (n === null) return null
  return pad ? pad2(n) : String(n)
}

module.exports = {
  normalizarReferencia,
  normalizarMatricula,
  extraerMatriculaEntrada,
  validarMatricula,
  refCarpeta,
  letraTipo,
}

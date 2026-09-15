// Nombre canónico de la carpeta de coche en OneDrive (fuente única: lo
// consumen src/lib/onedriveCarpetas.ts y scripts/normalize_carpetas_onedrive.js).
//   {refCarpeta}-{Marca}-{Modelo}-{MATRICULA}[-Alemania]

/* eslint-disable @typescript-eslint/no-require-imports */
const {
  normalizarReferencia,
  refCarpeta,
  validarMatricula,
  letraTipo,
} = require('./normalizacion')

// --------------------------------------------------------------------------
// Diccionarios. Editables: son la unica fuente de "como se escribe cada cosa".
// --------------------------------------------------------------------------

// alias (lowercase, sin acentos) -> marca canonica
const MARCAS = {
  vw: 'Volkswagen',
  volkswagen: 'Volkswagen',
  wolkswagen: 'Volkswagen',
  wv: 'Volkswagen',
  bmw: 'BMW',
  mercedes: 'Mercedes-Benz',
  'mercedes-benz': 'Mercedes-Benz',
  mercedesbenz: 'Mercedes-Benz',
  mb: 'Mercedes-Benz',
  citroen: 'Citroen',
  citron: 'Citroen',
  hyundai: 'Hyundai',
  hiunday: 'Hyundai',
  hiundai: 'Hyundai',
  hunday: 'Hyundai',
  kia: 'Kia',
  seat: 'Seat',
  opel: 'Opel',
  ford: 'Ford',
  nissan: 'Nissan',
  peugeot: 'Peugeot',
  renault: 'Renault',
  audi: 'Audi',
  fiat: 'Fiat',
  dacia: 'Dacia',
  jeep: 'Jeep',
  mazda: 'Mazda',
  smart: 'Smart',
  mini: 'Mini',
  tesla: 'Tesla',
  yamaha: 'Yamaha',
  toyota: 'Toyota',
  honda: 'Honda',
  skoda: 'Skoda',
  volvo: 'Volvo',
  suzuki: 'Suzuki',
  mitsubishi: 'Mitsubishi',
  lexus: 'Lexus',
  porsche: 'Porsche',
  chevrolet: 'Chevrolet',
  jaguar: 'Jaguar',
  ds: 'DS',
  cupra: 'Cupra',
  abarth: 'Abarth',
  iveco: 'Iveco',
}
// marcas de dos palabras: se prueban antes que las de una
const MARCAS_2 = {
  'land rover': 'Land Rover',
  'alfa romeo': 'Alfa Romeo',
  'range rover': 'Range Rover',
  'mercedes benz': 'Mercedes-Benz',
  'aston martin': 'Aston Martin',
}

// alias de modelo (lowercase, sin acentos) -> modelo canonico
const MODELOS = {
  xcreed: 'Xceed',
  xcedd: 'Xceed',
  xced: 'Xceed',
  xceed: 'Xceed',
  'x-ceed': 'Xceed',
  troc: 'T-Roc',
  tcross: 'T-Cross',
  moka: 'Mokka',
  taygo: 'Taigo',
  granland: 'Grandland',
  grandland: 'Grandland',
  crossland: 'Crossland',
  forttwo: 'Fortwo',
  fortwo: 'Fortwo',
  forfour: 'Forfour',
  compas: 'Compass',
  compass: 'Compass',
  qq: 'Qashqai',
  qashqai: 'Qashqai',
  bayo: 'Bayon',
  bayon: 'Bayon',
  insignia: 'Insignia',
  trailhaw: 'Trailhawk',
  granlandx: 'Grandland',
}

// tokens de modelo que van SIEMPRE en mayusculas
const ACRONIMOS = new Set([
  'GT',
  'GTI',
  'GTD',
  'GTE',
  'TDI',
  'TSI',
  'TFSI',
  'CDI',
  'HDI',
  'AMG',
  'RS',
  'ST',
  'SW',
  'XL',
  'FR',
  'TT',
  'TTS',
  'SQ',
  'CLA',
  'GLA',
  'GLC',
  'GLE',
  'GLB',
  'CX',
  'R',
  'S',
  'X',
  'N',
  'II',
  'III',
  'IV',
  'VI',
  'VII',
  'VIII',
  '4X4',
  'AT',
  'DSG',
])

// tokens que NO son modelo: se conservan como sufijo al final del nombre
const EXTRAS = new Set([
  'alemania',
  'alemana',
  'aleman',
  'alemanas',
  'alemanes',
  'importacion',
  'importado',
  'gris',
  'rojo',
  'roja',
  'azul',
  'blanco',
  'blanca',
  'negro',
  'negra',
  'verde',
  'amarillo',
  'naranja',
  'plata',
  'marron',
  'beige',
  'dorado',
  'inversor',
])

// --------------------------------------------------------------------------
// Utilidades
// --------------------------------------------------------------------------

/** @param {string} s */
function sinAcentos(s) {
  return s.normalize('NFD').replace(/[\u0300-\u036f]/g, '')
}

/** @param {unknown} s */
function clave(s) {
  return sinAcentos(String(s)).toLowerCase().trim()
}

/** @param {string} t */
function casearToken(t) {
  const up = t.toUpperCase()
  if (/\d/.test(t)) return up // I10, CX5, A180, 3008, 250E
  if (ACRONIMOS.has(up)) return up
  return up.charAt(0) + t.slice(1).toLowerCase()
}

/** @param {unknown} s */
function tokens(s) {
  return String(s ?? '')
    .replace(/["*:<>?/\\|]/g, ' ')
    .split(/[\s\-]+/)
    .map((t) => t.trim())
    .filter(Boolean)
}

/**
 * 'mercedes benz' → 'Mercedes-Benz', 'kia' → 'Kia', desconocida → Title Case.
 * @param {unknown} marca
 * @returns {string}
 */
function normalizarMarca(marca) {
  const k = clave(marca).replace(/\s+/g, ' ')
  if (!k) return ''
  if (MARCAS_2[k]) return MARCAS_2[k]
  if (MARCAS[k]) return MARCAS[k]
  return tokens(k).map(casearToken).join('-')
}

/**
 * 'xcreed' → 'Xceed', 'model 3' → 'Model-3', 'q2' → 'Q2', 'i10' → 'I10'.
 * @param {unknown} modelo
 * @returns {string}
 */
function normalizarModelo(modelo) {
  return tokens(modelo)
    .map((t) => MODELOS[clave(t)] ?? casearToken(t))
    .join('-')
}

/**
 * Quita caracteres no válidos en OneDrive, espacios → '-', sin guiones dobles.
 * @param {unknown} s
 * @returns {string}
 */
function sanearNombreCarpeta(s) {
  return String(s ?? '')
    .replace(/["*:<>?/\\|]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-{2,}/g, '-')
    .replace(/^-+|-+$/g, '')
}

/**
 * Sufijo -Alemania: la matrícula actual o algún alias no es española válida.
 * @param {string} matriculaNorm
 * @param {string[]} [aliases]
 * @returns {boolean}
 */
function esExtranjera(matriculaNorm, aliases = []) {
  const todas = [matriculaNorm, ...(aliases || [])]
    .map((m) => String(m ?? '').trim())
    .filter(Boolean)
  return todas.some((m) => validarMatricula(m).ok === false)
}

/**
 * @param {unknown} tipo letra C/I/D/R (o palabra legacy D/R)
 * @returns {'C'|'I'|'D'|'R'|null}
 */
function letraCarpeta(tipo) {
  const t = String(tipo ?? '')
    .trim()
    .toUpperCase()
  if (t === 'C' || t === 'I' || t === 'D' || t === 'R') return t
  return letraTipo(t)
}

/**
 * Nombre canónico de la carpeta; null si la referencia no es interpretable,
 * el tipo no tiene carpeta (M / null) o no hay matrícula.
 * @param {{ referencia: unknown, tipo: unknown, marca: unknown, modelo: unknown, matriculaNorm: unknown, aliases?: string[] }} v
 * @returns {string|null}
 */
function nombreCarpetaCanonico(v) {
  const tipo = letraCarpeta(v.tipo)
  if (!tipo) return null
  const matricula = String(v.matriculaNorm ?? '')
    .trim()
    .toUpperCase()
  if (!matricula) return null
  const ref = refCarpeta(normalizarReferencia(v.referencia, tipo), {
    pad: false,
    tipo,
  })
  if (!ref) return null
  const partes = [
    ref,
    normalizarMarca(v.marca),
    normalizarModelo(v.modelo),
    matricula,
  ]
  if (esExtranjera(matricula, v.aliases || [])) partes.push('Alemania')
  return sanearNombreCarpeta(partes.filter(Boolean).join('-'))
}

module.exports = {
  MARCAS,
  MARCAS_2,
  MODELOS,
  ACRONIMOS,
  EXTRAS,
  sinAcentos,
  clave,
  casearToken,
  normalizarMarca,
  normalizarModelo,
  sanearNombreCarpeta,
  esExtranjera,
  nombreCarpetaCanonico,
}

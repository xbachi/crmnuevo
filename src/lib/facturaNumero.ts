/**
 * Extracción del número CANÓNICO de factura desde el nombre del PDF (o texto).
 *
 * Motivación (auditoría C-03): gasto_facturas dedupe por (tipo, numero_factura)
 * pero numero_factura guarda el NOMBRE DEL ARCHIVO, no el nº real → la misma
 * factura archivada con dos nombres (`_2`, renombres) se cargó dos veces.
 *
 * Regla de oro: si el extractor no está SEGURO devuelve null. Un null no
 * colisiona; un número mal extraído sí.
 */

const EXT_RE = /\.(PDF|JPG|JPEG|PNG|TIF|TIFF|HEIC)$/
// Sufijos de copia del filename: `_2`, `(1)`, `-copia`, `- copy`… No forman
// parte del nº de factura. Se quitan iterativamente ("factura_2 (1)").
const COPIA_RE = /(?:[-_ ]?\(\d{1,2}\)|_\d{1,2}|[-_ ]+COPIA|[-_ ]+COPY)$/

/**
 * Normaliza un filename/texto para extraer el nº: mayúsculas, sin extensión,
 * sin sufijos de copia, espacios colapsados.
 */
export function normalizarNombreFactura(filenameOrText: string): string {
  let s = String(filenameOrText).toUpperCase().trim().replace(/\s+/g, ' ')
  s = s.replace(EXT_RE, '')
  let prev = ''
  while (prev !== s) {
    prev = s
    s = s.replace(COPIA_RE, '').trim()
  }
  return s
}

const stripCeros = (d: string): string | null => {
  const s = d.replace(/^0+/, '')
  return s === '' ? null : s
}

type Familia = 'mecauto' | 'fergo' | 'world' | 'nagini' | 'wallapop' | 'enterprise'

/** Familia de proveedor a partir del string libre de proveedor/tipo. */
function familiaDeProveedor(proveedor?: string): Familia | null {
  const p = String(proveedor ?? '').toLowerCase()
  if (!p) return null
  if (p.includes('mecauto')) return 'mecauto'
  if (p.includes('fergo')) return 'fergo'
  if (p.includes('world') || p.includes('detailing') || p.includes('limpieza')) return 'world'
  if (p.includes('nagini') || p.includes('energia')) return 'nagini'
  if (p.includes('wallapop')) return 'wallapop'
  if (p.includes('enterprise')) return 'enterprise'
  return null
}

/** Devuelve los canónicos DISTINTOS que matchean en el texto para una familia. */
function candidatos(n: string, familia: Familia): string[] {
  const out = new Set<string>()
  switch (familia) {
    case 'mecauto': {
      // FC26-179 ≡ FC26 179 ≡ FC26179 (p.ej. "Fra-FC26179"). "FC26-D" (sin
      // dígitos) NO matchea → null, es una serie ambigua vista en filenames.
      for (const m of n.matchAll(/FC26[-_. ]?(\d{1,4})(?!\d)/g)) {
        const d = stripCeros(m[1])
        if (d) out.add(`FC26-${d}`)
      }
      break
    }
    case 'fergo': {
      // F260017, F2600113… el nº incluye sus ceros: se toma literal.
      for (const m of n.matchAll(/(?<![A-Z0-9])(F260\d{2,4})(?!\d)/g)) out.add(m[1])
      break
    }
    case 'world': {
      // Canónico 26/NN. Formas seguras: "26/NN" literal o "LIMPIEZA-26-NN".
      // "26-NN" suelto solo si el proveedor ES world (y no parece fecha:
      // "26-03-2026" se descarta por el lookahead de continuación numérica).
      for (const m of n.matchAll(/(?<![A-Z0-9])26\/(\d{1,3})(?!\d)/g)) {
        const d = stripCeros(m[1])
        if (d) out.add(`26/${d}`)
      }
      for (const m of n.matchAll(/LIMPIEZA[-_. ]?26[-_. ](\d{1,3})(?!\d)(?![-_.]\d)/g)) {
        const d = stripCeros(m[1])
        if (d) out.add(`26/${d}`)
      }
      break
    }
    case 'nagini': {
      for (const m of n.matchAll(/ENERGIA[-_. ]?(\d{1,6})(?!\d)/g)) out.add(`ENERGIA-${m[1]}`)
      break
    }
    case 'wallapop': {
      // FVM + dígitos/letras/guiones; el guión no es significativo → se quita.
      for (const m of n.matchAll(/(?<![A-Z0-9])(FVM-?\d[\dA-Z-]{3,})(?![A-Z0-9])/g)) {
        out.add(m[1].replace(/-/g, '')) // literal, solo sin guiones
      }
      break
    }
    case 'enterprise': {
      for (const m of n.matchAll(/(?<![A-Z0-9])(E0\d{6,})(?!\d)/g)) out.add(m[1])
      break
    }
  }
  return [...out]
}

/** Variante de world habilitada solo con proveedor explícito world. */
function candidatosWorldDash(n: string): string[] {
  const out = new Set<string>()
  for (const m of n.matchAll(/(?<![A-Z0-9])26[-_.](\d{1,3})(?!\d)(?![-_.]\d)/g)) {
    const d = stripCeros(m[1])
    if (d) out.add(`26/${d}`)
  }
  return [...out]
}

const TODAS: Familia[] = ['mecauto', 'fergo', 'world', 'nagini', 'wallapop', 'enterprise']

/**
 * Extrae el nº canónico de factura, o null si no hay match INEQUÍVOCO
 * (cero matches, o más de un nº distinto → ambiguo → null).
 * `proveedor` (o tipo) opcional restringe a los patrones de esa familia.
 */
export function extraerNumeroCanonico(filenameOrText: string, proveedor?: string): string | null {
  const n = normalizarNombreFactura(filenameOrText)
  if (!n) return null
  const familia = familiaDeProveedor(proveedor)
  const familias = familia ? [familia] : TODAS
  const encontrados = new Set<string>()
  for (const f of familias) {
    for (const c of candidatos(n, f)) encontrados.add(c)
  }
  // "26-NN" sin la palabra LIMPIEZA: solo confiable si sabemos que es world.
  if (familia === 'world' && encontrados.size === 0) {
    for (const c of candidatosWorldDash(n)) encontrados.add(c)
  }
  if (encontrados.size !== 1) return null
  return [...encontrados][0]
}

/**
 * Cruce de la ficha técnica (tarjeta ITV) con los datos del coche.
 *
 * La ficha técnica es la ÚNICA fuente fiable: los datos del CRM y los de la web
 * se teclean a mano al dar de alta el vehículo y nadie los vuelve a mirar. Un
 * script externo lee la foto de la tarjeta (carpeta de OneDrive) con IA y manda
 * la extracción a POST /api/fichas-tecnicas/snapshot; este módulo es la parte
 * pura —sin pg, sin fetch— que decide qué no cuadra y qué se puede arreglar solo.
 *
 * Dos superficies distintas:
 *  · CRM  → matrícula, bastidor, color, fecha de matriculación (+ marca/modelo,
 *           solo como aviso). Es lo único que el CRM guarda de la ficha.
 *  · Web  → combustible, cilindrada, potencia, plazas, cambio. Eso vive SOLO en
 *           WordPress y lo edita el cliente a mano: nunca se toca desde aquí.
 *
 * ── Tabla de decisión de decidir() ──────────────────────────────────────────
 *
 *  fuente  campo                 confianza   estado del valor actual   decisión
 *  ------  --------------------  ----------  ------------------------  --------
 *  crm     color                 >= 0.9      vacío                     corregir
 *  crm     color                 >= 0.9      distinto                  revisar
 *  crm     color                 <  0.9      cualquiera                revisar
 *  crm     fechaMatriculacion    >= 0.9      vacío                     corregir
 *  crm     fechaMatriculacion    >= 0.9      misma fecha, otro formato corregir
 *  crm     fechaMatriculacion    >= 0.9      otra fecha                revisar
 *  crm     fechaMatriculacion    <  0.9      cualquiera                revisar
 *  crm     matricula             cualquiera  cualquiera                revisar
 *  crm     bastidor              cualquiera  cualquiera                revisar
 *  crm     marca / modelo        cualquiera  cualquiera                revisar
 *  web     cualquiera            cualquiera  cualquiera                revisar
 *
 * Matrícula y bastidor NO se corrigen NUNCA de forma automática aunque la
 * confianza sea 1: son la identidad del coche, cuelgan de ellos las facturas, el
 * expediente de gestoría y la ficha pública, y un carácter mal leído por la IA
 * (0/O, 1/I, B/8 en un bastidor) rompe todos esos cruces a la vez. Marca y modelo
 * tampoco: la ITV pone el nombre del fabricante y el código de proyecto ("KIA" /
 * "SLS"), no el nombre comercial con el que se publica el coche.
 */

import { normPlate } from '@/lib/facturasRegistro'

/** La normalización de matrícula es la del resto del CRM. */
export { normPlate }

export interface CampoExtraido {
  valor: string | number | null
  /** 0..1 según lo legible que estuviera la foto. */
  confianza: number
}

/** `campos` del snapshot. Cualquier clave puede faltar o venir con valor null. */
export type CamposFicha = Record<string, CampoExtraido | null | undefined>

/** Lo que el CRM guarda del coche. `fechaMatriculacion` es TEXT en producción. */
export interface VehiculoCrm {
  id: number
  referencia?: string | null
  marca: string | null
  modelo: string | null
  matricula: string | null
  bastidor: string | null
  color: string | null
  fechaMatriculacion: string | null
}

/** Respuesta de GET /wp-json/sevencars/v1/vehiculo/ficha (WordPress). */
export interface FichaWeb {
  id: number | null
  url: string | null
  marca: string | null
  modelo: string | null
  version: string | null
  combustible: string | null
  cubicaje: string | number | null
  cv: string | number | null
  caja: string | null
  matriculacion: string | null
  fecha_matriculacion: string | null
  matricula: string | null
  /** No está en el contrato actual del endpoint; se compara si aparece. */
  plazas?: string | number | null
}

export type CampoCrm =
  | 'matricula'
  | 'bastidor'
  | 'color'
  | 'fechaMatriculacion'
  | 'marca'
  | 'modelo'

export type CampoWeb =
  | 'combustible'
  | 'cilindrada_cc'
  | 'potencia_cv'
  | 'plazas'
  | 'cambio'
  | 'matriculacion_texto'
  | 'matriculacion_fecha'

export type FuenteDato = 'crm' | 'web'
export type Decision = 'corregir' | 'revisar'

/**
 * 'vacio'     → el lado actual no tiene nada y la ficha sí.
 * 'formato'   → es el mismo dato escrito de otra forma (fecha, sobre todo).
 * 'conflicto' → dicen cosas distintas de verdad.
 */
export type TipoDiscrepancia = 'vacio' | 'formato' | 'conflicto'

export interface Discrepancia {
  fuente: FuenteDato
  campo: CampoCrm | CampoWeb
  etiqueta: string
  tipo: TipoDiscrepancia
  /** Valor tal como está hoy en el CRM / la web. null = vacío. */
  valorActual: string | null
  /** Valor de la ficha ya en la forma en que se guardaría. */
  valorFicha: string
  /** Valor crudo leído por la IA (para el aviso: hay que poder auditarlo). */
  valorFichaCrudo: string
  confianza: number
}

/** Campos que el cron puede escribir solo, y su columna en "Vehiculo". */
export const COLUMNA_CRM: Record<CampoCrm, string> = {
  matricula: 'matricula',
  bastidor: 'bastidor',
  color: 'color',
  fechaMatriculacion: 'fechaMatriculacion',
  marca: 'marca',
  modelo: 'modelo',
}

export const CAMPOS_CORREGIBLES: readonly CampoCrm[] = [
  'color',
  'fechaMatriculacion',
]
export const CONFIANZA_MINIMA = 0.9

// ── Normalizadores ──────────────────────────────────────────────────────────

/** Mayúsculas, sin acentos, sin dobles espacios. Para comparar texto libre. */
export function normalizarTexto(v: unknown): string {
  return String(v ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/\s+/g, ' ')
    .trim()
}

/** El bastidor (VIN) es alfanumérico puro: guiones y espacios sobran. */
export function normalizarBastidor(v: unknown): string {
  return String(v ?? '')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
}

/** Vocabulario de combustible de la web (es el que publica WordPress). */
export type Combustible =
  | 'Gasolina'
  | 'Diésel'
  | 'Híbrido'
  | 'Eléctrico'
  | 'GLP'

/**
 * Lo que dice la ITV → el vocabulario de la web. La tarjeta escribe «GASÓLEO»,
 * «GASOLINA», «ELÉCTRICO»… y WordPress publica «Diésel», «Gasolina», etc.
 *
 * El orden importa: «HÍBRIDO ELÉCTRICO» es híbrido (no eléctrico) y «GASÓLEO»
 * empieza igual que «GASOLINA», así que el gasóleo se mira antes.
 */
export function normalizarCombustible(v: unknown): Combustible | null {
  const s = normalizarTexto(v).replace(/[\s.\-/]/g, '')
  if (!s) return null
  if (s.includes('HIBRID')) return 'Híbrido'
  if (s.includes('ELECTRIC') || s.includes('ELECTRO')) return 'Eléctrico'
  if (s.includes('GLP') || s.includes('LICUADO')) return 'GLP'
  if (s.includes('DIESEL') || s.includes('GASOLEO') || s.includes('GASOIL')) {
    return 'Diésel'
  }
  if (s.includes('GASOLINA') || s.includes('BENCINA')) return 'Gasolina'
  return null
}

const MESES: Record<string, number> = {
  ENE: 1,
  JAN: 1,
  FEB: 2,
  MAR: 3,
  ABR: 4,
  APR: 4,
  MAY: 5,
  JUN: 6,
  JUL: 7,
  AGO: 8,
  AUG: 8,
  SEP: 9,
  SET: 9,
  OCT: 10,
  NOV: 11,
  DIC: 12,
  DEC: 12,
}

/**
 * Cualquier fecha razonable → 'YYYY-MM-DD', o 'YYYY-MM' cuando solo se conoce el
 * mes («Jul 2020», «07/2020»). Devolver el mes suelto en vez de inventar un día
 * es lo que permite después comparar sin dar falsos positivos (ver mismaFecha).
 *
 * Acepta: 2020-07-15 (con o sin hora), 15/07/2020, 15-07-2020, Jul 2020,
 * julio 2020, 07/2020, 2020.
 */
export function normalizarFecha(v: unknown): string | null {
  const s = String(v ?? '').trim()
  if (!s) return null
  const dos = (n: number) => String(n).padStart(2, '0')

  const iso = /^(\d{4})-(\d{1,2})(?:-(\d{1,2}))?/.exec(s)
  if (iso) {
    const mes = parseInt(iso[2], 10)
    if (mes < 1 || mes > 12) return null
    if (!iso[3]) return `${iso[1]}-${dos(mes)}`
    const dia = parseInt(iso[3], 10)
    if (dia < 1 || dia > 31) return null
    return `${iso[1]}-${dos(mes)}-${dos(dia)}`
  }

  const dmy = /^(\d{1,2})[/.\-](\d{1,2})[/.\-](\d{4})$/.exec(s)
  if (dmy) {
    const dia = parseInt(dmy[1], 10)
    const mes = parseInt(dmy[2], 10)
    if (dia < 1 || dia > 31 || mes < 1 || mes > 12) return null
    return `${dmy[3]}-${dos(mes)}-${dos(dia)}`
  }

  const my = /^(\d{1,2})[/.\-](\d{4})$/.exec(s)
  if (my) {
    const mes = parseInt(my[1], 10)
    if (mes < 1 || mes > 12) return null
    return `${my[2]}-${dos(mes)}`
  }

  // «Jul 2020», «julio 2020», «jul-2020»
  const texto = normalizarTexto(s).replace(/[.\-/]/g, ' ')
  const nom = /^([A-Z]{3,})\s+(\d{4})$/.exec(texto)
  if (nom) {
    const mes = MESES[nom[1].slice(0, 3)]
    if (mes) return `${nom[2]}-${dos(mes)}`
  }
  const nomInv = /^(\d{4})\s+([A-Z]{3,})$/.exec(texto)
  if (nomInv) {
    const mes = MESES[nomInv[2].slice(0, 3)]
    if (mes) return `${nomInv[1]}-${dos(mes)}`
  }

  const soloAnio = /^(\d{4})$/.exec(s)
  if (soloAnio) return soloAnio[1]

  return null
}

/**
 * ¿Las dos fechas designan el mismo momento, aunque una sea menos precisa?
 * '2020-07' y '2020-07-15' son la misma matriculación escrita con distinto
 * detalle; '2020-06' y '2020-07' no.
 */
export function mismaFecha(a: string | null, b: string | null): boolean {
  if (!a || !b) return false
  return a.startsWith(b) || b.startsWith(a)
}

/**
 * Entero de un campo numérico de la ficha o de la web: «1.598 cc» → 1598,
 * «136 CV» → 136, «136,00» → 136. Los decimales se descartan: en cilindrada,
 * potencia y plazas no aportan nada y solo generan falsas discrepancias.
 */
export function normalizarNumero(v: unknown): number | null {
  if (v === null || v === undefined) return null
  if (typeof v === 'number') return Number.isFinite(v) ? Math.round(v) : null
  let s = String(v).trim().replace(/\s+/g, '')
  if (!s) return null
  s = s.replace(/[.,](\d{1,2})$/, '')
  const digitos = s.replace(/\D+/g, '')
  if (!digitos) return null
  const n = parseInt(digitos, 10)
  return Number.isFinite(n) ? n : null
}

// ── Lectura del bloque `campos` ─────────────────────────────────────────────

function leer(campos: CamposFicha, clave: string): CampoExtraido | null {
  const c = campos?.[clave]
  if (!c || typeof c !== 'object') return null
  if (c.valor === null || c.valor === undefined || c.valor === '') return null
  const confianza =
    typeof c.confianza === 'number' && Number.isFinite(c.confianza)
      ? Math.max(0, Math.min(1, c.confianza))
      : 0
  return { valor: c.valor, confianza }
}

function crudo(c: CampoExtraido): string {
  return String(c.valor).trim()
}

// ── Comparación contra el CRM ───────────────────────────────────────────────

interface DefCrm {
  campo: CampoCrm
  etiqueta: string
  clave: string
  /** Valor que se guardaría en el CRM (normalizado a forma canónica). */
  aGuardar: (c: CampoExtraido) => string
  /** Clave de comparación de los dos lados. '' = sin dato. */
  comparable: (v: unknown) => string
}

const DEF_CRM: DefCrm[] = [
  {
    campo: 'matricula',
    etiqueta: 'Matrícula',
    clave: 'matricula',
    aGuardar: (c) => normPlate(crudo(c)),
    comparable: (v) => normPlate(String(v ?? '')),
  },
  {
    campo: 'bastidor',
    etiqueta: 'Bastidor',
    clave: 'bastidor',
    aGuardar: (c) => normalizarBastidor(crudo(c)),
    comparable: normalizarBastidor,
  },
  {
    campo: 'color',
    etiqueta: 'Color',
    clave: 'color',
    aGuardar: (c) => crudo(c),
    comparable: normalizarTexto,
  },
  {
    campo: 'marca',
    etiqueta: 'Marca',
    clave: 'marca',
    aGuardar: (c) => crudo(c),
    comparable: normalizarTexto,
  },
  {
    campo: 'modelo',
    etiqueta: 'Modelo',
    clave: 'modelo',
    aGuardar: (c) => crudo(c),
    comparable: normalizarTexto,
  },
]

/**
 * Discrepancias entre el coche del CRM y su ficha técnica.
 *
 * Solo mira los campos que el CRM guarda. Si la ficha no trae el campo o lo trae
 * vacío, no hay nada que comparar (la ausencia no es una discrepancia: la foto
 * puede estar ilegible en esa línea, y para eso está `notas`).
 */
export function compararConCrm(
  vehiculo: VehiculoCrm,
  campos: CamposFicha
): Discrepancia[] {
  const out: Discrepancia[] = []

  for (const def of DEF_CRM) {
    const c = leer(campos, def.clave)
    if (!c) continue
    const guardar = def.aGuardar(c)
    if (!guardar) continue

    const actualRaw = vehiculo[def.campo]
    const actual = def.comparable(actualRaw)
    const ficha = def.comparable(guardar)
    if (!ficha) continue

    if (!actual) {
      out.push(
        disc(
          'crm',
          def.campo,
          def.etiqueta,
          'vacio',
          null,
          guardar,
          crudo(c),
          c.confianza
        )
      )
    } else if (actual !== ficha) {
      out.push(
        disc(
          'crm',
          def.campo,
          def.etiqueta,
          'conflicto',
          String(actualRaw ?? ''),
          guardar,
          crudo(c),
          c.confianza
        )
      )
    }
  }

  // La fecha va aparte: es TEXT libre en producción («15/07/2020», «Jul 2020»,
  // ISO…) y hay que distinguir "otro formato" de "otra fecha".
  const cf = leer(campos, 'fecha_primera_matriculacion')
  const isoFicha = cf ? normalizarFecha(crudo(cf)) : null
  if (cf && isoFicha) {
    const actualRaw = vehiculo.fechaMatriculacion
    const isoActual = normalizarFecha(actualRaw)
    const etiqueta = 'Fecha de matriculación'
    if (!isoActual) {
      out.push(
        disc(
          'crm',
          'fechaMatriculacion',
          etiqueta,
          'vacio',
          actualRaw ? String(actualRaw) : null,
          isoFicha,
          crudo(cf),
          cf.confianza
        )
      )
    } else if (!mismaFecha(isoActual, isoFicha)) {
      out.push(
        disc(
          'crm',
          'fechaMatriculacion',
          etiqueta,
          'conflicto',
          String(actualRaw),
          isoFicha,
          crudo(cf),
          cf.confianza
        )
      )
    } else if (
      String(actualRaw) !== isoFicha &&
      isoFicha.length >= isoActual.length
    ) {
      // Misma fecha peor escrita (o menos precisa) en el CRM: se canoniza.
      out.push(
        disc(
          'crm',
          'fechaMatriculacion',
          etiqueta,
          'formato',
          String(actualRaw),
          isoFicha,
          crudo(cf),
          cf.confianza
        )
      )
    }
  }

  return out
}

// ── Comparación contra WordPress ────────────────────────────────────────────

interface DefWeb {
  campo: CampoWeb
  etiqueta: string
  claveFicha: string
  claveWeb: keyof FichaWeb
  comparable: (v: unknown) => string
  aTexto: (v: unknown) => string
}

const numeroTexto = (v: unknown) => {
  const n = normalizarNumero(v)
  return n === null ? '' : String(n)
}

const MESES_NOMBRE = [
  'Enero',
  'Febrero',
  'Marzo',
  'Abril',
  'Mayo',
  'Junio',
  'Julio',
  'Agosto',
  'Septiembre',
  'Octubre',
  'Noviembre',
  'Diciembre',
]

// La web escribe la matriculación como «Mayo 2018» y la ordena por 201805: el
// formato da igual, lo que tiene que cuadrar con el documento es el mes y el año.
const mesAnio = (v: unknown) => {
  const s = String(v ?? '').trim()
  const num = /^(\d{4})(\d{2})$/.exec(s)
  const f = num ? `${num[1]}-${num[2]}` : normalizarFecha(s)
  return f ? f.slice(0, 7) : ''
}

const mesAnioTexto = (v: unknown) => {
  const m = mesAnio(v)
  if (!m) return String(v ?? '').trim()
  return `${MESES_NOMBRE[parseInt(m.slice(5, 7), 10) - 1]} ${m.slice(0, 4)}`
}

const DEF_WEB: DefWeb[] = [
  {
    campo: 'combustible',
    etiqueta: 'Combustible',
    claveFicha: 'combustible',
    claveWeb: 'combustible',
    comparable: (v) => normalizarCombustible(v) ?? '',
    aTexto: (v) => normalizarCombustible(v) ?? String(v ?? '').trim(),
  },
  {
    campo: 'cilindrada_cc',
    etiqueta: 'Cilindrada (cc)',
    claveFicha: 'cilindrada_cc',
    claveWeb: 'cubicaje',
    comparable: numeroTexto,
    aTexto: numeroTexto,
  },
  {
    campo: 'potencia_cv',
    etiqueta: 'Potencia (CV)',
    claveFicha: 'potencia_cv',
    claveWeb: 'cv',
    comparable: numeroTexto,
    aTexto: numeroTexto,
  },
  {
    campo: 'plazas',
    etiqueta: 'Plazas',
    claveFicha: 'plazas',
    claveWeb: 'plazas',
    comparable: numeroTexto,
    aTexto: numeroTexto,
  },
  {
    campo: 'cambio',
    etiqueta: 'Cambio',
    claveFicha: 'cambio',
    claveWeb: 'caja',
    comparable: normalizarTexto,
    aTexto: (v) => String(v ?? '').trim(),
  },
  {
    campo: 'matriculacion_texto',
    etiqueta: 'Matriculación (texto de la ficha)',
    claveFicha: 'fecha_primera_matriculacion',
    claveWeb: 'matriculacion',
    comparable: mesAnio,
    aTexto: mesAnioTexto,
  },
  {
    campo: 'matriculacion_fecha',
    etiqueta: 'Matriculación (fecha)',
    claveFicha: 'fecha_primera_matriculacion',
    claveWeb: 'fecha_matriculacion',
    comparable: mesAnio,
    aTexto: mesAnioTexto,
  },
]

/**
 * Discrepancias entre la ficha pública de WordPress y la ficha técnica.
 *
 * Estos datos NO están en el CRM y NO se corrigen nunca desde aquí: la web es del
 * cliente y los edita él. Todo lo que salga de aquí acaba en la bandeja y en el
 * correo con el enlace al editor.
 */
export function compararConWeb(
  web: FichaWeb | null | undefined,
  campos: CamposFicha
): Discrepancia[] {
  if (!web) return []
  const out: Discrepancia[] = []

  for (const def of DEF_WEB) {
    const c = leer(campos, def.claveFicha)
    if (!c) continue
    const ficha = def.comparable(crudo(c))
    if (!ficha) continue

    const actualRaw = web[def.claveWeb]
    const actual = def.comparable(actualRaw)
    const texto = def.aTexto(crudo(c))

    if (!actual) {
      out.push(
        disc(
          'web',
          def.campo,
          def.etiqueta,
          'vacio',
          null,
          texto,
          crudo(c),
          c.confianza
        )
      )
    } else if (actual !== ficha) {
      out.push(
        disc(
          'web',
          def.campo,
          def.etiqueta,
          'conflicto',
          String(actualRaw ?? ''),
          texto,
          crudo(c),
          c.confianza
        )
      )
    }
  }

  return out
}

function disc(
  fuente: FuenteDato,
  campo: CampoCrm | CampoWeb,
  etiqueta: string,
  tipo: TipoDiscrepancia,
  valorActual: string | null,
  valorFicha: string,
  valorFichaCrudo: string,
  confianza: number
): Discrepancia {
  return {
    fuente,
    campo,
    etiqueta,
    tipo,
    valorActual,
    valorFicha,
    valorFichaCrudo,
    confianza,
  }
}

// ── Decisión ────────────────────────────────────────────────────────────────

/**
 * ¿Se arregla solo o lo mira una persona? Ver la tabla del docblock del módulo.
 * Ante la duda, 'revisar': un aviso de más cuesta 30 segundos, un dato pisado mal
 * puede tardar meses en descubrirse.
 */
export function decidir(d: Discrepancia): Decision {
  if (d.fuente !== 'crm') return 'revisar'
  if (!CAMPOS_CORREGIBLES.includes(d.campo as CampoCrm)) return 'revisar'
  if (typeof d.confianza !== 'number' || !(d.confianza >= CONFIANZA_MINIMA)) {
    return 'revisar'
  }
  if (!d.valorFicha) return 'revisar'
  // 'conflicto' = la ficha dice otra cosa que el CRM. Eso lo decide un humano.
  if (d.tipo === 'conflicto') return 'revisar'
  return 'corregir'
}

/**
 * Clave de dedup de la bandeja. Incluye el hash de la ficha a propósito: una
 * discrepancia ya avisada no se repite cada mañana, pero si llega una foto nueva
 * (hash distinto) y sigue sin cuadrar, vuelve a avisar.
 */
export function dedupKeyFicha(
  vehiculoId: number,
  campo: string,
  hash: string
): string {
  return `ficha_tecnica:${vehiculoId}:${campo}:${hash}`
}

/** Un único ítem por coche publicado sin ficha en la carpeta. */
export function dedupKeySinFicha(vehiculoId: number): string {
  return `ficha_tecnica:${vehiculoId}:sin-ficha`
}

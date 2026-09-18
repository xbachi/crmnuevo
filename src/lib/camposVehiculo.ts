/**
 * Qué campos del coche son obligatorios, cuándo y por qué.
 *
 * Módulo puro (sin pg, sin fetch, sin React): es la ÚNICA definición de las
 * reglas. Las rutas de API y la UI preguntan aquí; nadie vuelve a escribir una
 * lista de campos obligatorios en otro sitio.
 *
 * Cuatro grupos, acordados con negocio:
 *
 *  A · CAMPOS_ALTA     — sin esto no se crea el coche. Es lo que sabe la persona
 *                        que lo compra en el momento de comprarlo.
 *  P · CAMPOS_PUBLICAR — sin esto no se pasa a PUBLICADO. Es lo que necesita la
 *                        ficha pública y el presupuesto.
 *  D · CAMPOS_DOC      — lo saca el permiso de circulación / la tarjeta ITV. El
 *                        cron los rellena solo cuando el CRM los tiene vacíos,
 *                        pero publicar exige que una persona los haya
 *                        confirmado: son datos leídos por IA de una foto.
 *  O · opcional        — porte, abonado, comprobante, recibido, ubicación,
 *                        garantía de fábrica, ITV, mantenimientos. Nunca bloquean.
 *  C · lo pone el CRM  — referencia, GP, % dto, cuota, carpeta, estado.
 *
 * Los campos D son además obligatorios para publicar: un coche no sale a la web
 * sin bastidor, fecha de matriculación, combustible, cilindrada, potencia,
 * plazas ni versión. `nombre_comercial` (la versión, casilla D.2) está en los
 * dos grupos a propósito: lo lee el documento y además hace falta para publicar.
 *
 * Los valores viven en dos tablas — "Vehiculo" y vehiculo_ficha_comercial —, así
 * que cada campo declara dónde está (`tabla` + `columna`) y quien escriba usa
 * eso en vez de un switch repartido por el código.
 */

import { normalizarTipo, type TipoVehiculo } from '@/lib/vehiculoEstado'

/** Dónde vive el valor del campo. */
export type TablaCampo = 'vehiculo' | 'ficha'

export interface CampoDef {
  /** Nombre lógico. Es la clave de vehiculo_campos_doc.campo y del `faltantes`. */
  campo: string
  /** Etiqueta de UI, tal como la lee una persona. */
  etiqueta: string
  tabla: TablaCampo
  /** Columna SQL en su tabla. */
  columna: string
}

export interface Faltante {
  campo: string
  etiqueta: string
  /** Frase en tuteo lista para pintar: por qué falta. */
  motivo: string
}

// ── A · obligatorios al dar de alta ─────────────────────────────────────────

/**
 * Lo que hay que saber para crear el coche. `referencia`, `marca`, `modelo`,
 * `matricula` y `tipo` los siguen validando además las rutas (normalización,
 * unicidad, formato de matrícula): aquí sólo se comprueba que estén.
 *
 * `bastidor` NO está: lo trae el permiso de circulación (grupo D) y exigirlo en
 * el alta obligaba a inventárselo o a dejar el coche sin dar de alta.
 */
export const CAMPOS_ALTA: readonly CampoDef[] = [
  { campo: 'tipo', etiqueta: 'Tipo', tabla: 'vehiculo', columna: 'tipo' },
  { campo: 'marca', etiqueta: 'Marca', tabla: 'vehiculo', columna: 'marca' },
  { campo: 'modelo', etiqueta: 'Modelo', tabla: 'vehiculo', columna: 'modelo' },
  {
    campo: 'matricula',
    etiqueta: 'Matrícula',
    tabla: 'vehiculo',
    columna: 'matricula',
  },
  { campo: 'kms', etiqueta: 'Kilómetros', tabla: 'vehiculo', columna: 'kms' },
  {
    campo: 'fechaCompra',
    etiqueta: 'Fecha de compra',
    tabla: 'vehiculo',
    columna: 'fechaCompra',
  },
  {
    campo: 'proveedor',
    etiqueta: 'Proveedor',
    tabla: 'vehiculo',
    columna: 'proveedor',
  },
  {
    campo: 'precioCompra',
    etiqueta: 'Precio de compra',
    tabla: 'vehiculo',
    columna: 'precioCompra',
  },
] as const

/** Condicional del tipo I: un coche de inversor sin inversor no se sostiene. */
const CAMPO_INVERSOR: CampoDef = {
  campo: 'inversorId',
  etiqueta: 'Inversor',
  tabla: 'vehiculo',
  columna: 'inversorId',
}

/**
 * Condicional del tipo D (depósito): el dinero que se le ha prometido al dueño
 * del coche. Comparte columna con el precio de compra —para un depósito, lo
 * acordado con el cliente ES el coste de adquisición y de ahí sale el margen—,
 * sólo cambia cómo se llama en pantalla.
 */
const ETIQUETA_PRECIO_DEPOSITO = 'Precio acordado con el cliente'

// ── P · obligatorios para publicar ──────────────────────────────────────────

export const CAMPOS_PUBLICAR: readonly CampoDef[] = [
  {
    campo: 'nombre_comercial',
    etiqueta: 'Versión / nombre comercial',
    tabla: 'ficha',
    columna: 'nombre_comercial',
  },
  { campo: 'color', etiqueta: 'Color', tabla: 'vehiculo', columna: 'color' },
  { campo: 'caja', etiqueta: 'Cambio', tabla: 'ficha', columna: 'caja' },
  {
    campo: 'regimen',
    etiqueta: 'Régimen (IVA / REBU)',
    tabla: 'ficha',
    columna: 'regimen',
  },
  {
    campo: 'precio_contado',
    etiqueta: 'Precio contado',
    tabla: 'vehiculo',
    columna: 'precioPublicacion',
  },
  {
    campo: 'tarifa_financiacion',
    etiqueta: 'Tarifa de financiación',
    tabla: 'ficha',
    columna: 'tarifa_financiacion',
  },
  {
    campo: 'url_imagen',
    etiqueta: 'Foto principal',
    tabla: 'ficha',
    columna: 'url_imagen',
  },
] as const

// ── D · los saca el documento y hay que confirmarlos ────────────────────────

export const CAMPOS_DOC: readonly CampoDef[] = [
  {
    campo: 'bastidor',
    etiqueta: 'Bastidor',
    tabla: 'vehiculo',
    columna: 'bastidor',
  },
  {
    campo: 'fechaMatriculacion',
    etiqueta: 'Fecha de 1ª matriculación',
    tabla: 'vehiculo',
    columna: 'fechaMatriculacion',
  },
  {
    campo: 'combustible',
    etiqueta: 'Combustible',
    tabla: 'ficha',
    columna: 'combustible',
  },
  {
    campo: 'cubicaje',
    etiqueta: 'Cilindrada (cc)',
    tabla: 'ficha',
    columna: 'cubicaje',
  },
  {
    campo: 'motor_kw',
    etiqueta: 'Potencia (kW)',
    tabla: 'ficha',
    columna: 'motor_kw',
  },
  {
    campo: 'motor_cv',
    etiqueta: 'Potencia (CV)',
    tabla: 'ficha',
    columna: 'motor_cv',
  },
  { campo: 'plazas', etiqueta: 'Plazas', tabla: 'ficha', columna: 'plazas' },
  {
    campo: 'nombre_comercial',
    etiqueta: 'Versión / nombre comercial',
    tabla: 'ficha',
    columna: 'nombre_comercial',
  },
] as const

/** Índice por nombre lógico: quien escribe un campo D necesita su columna. */
export const CAMPOS_DOC_POR_NOMBRE: Record<string, CampoDef> =
  Object.fromEntries(CAMPOS_DOC.map((c) => [c.campo, c]))

/** ¿Es un nombre de campo que el documento puede rellenar? */
export function esCampoDoc(campo: unknown): campo is string {
  return typeof campo === 'string' && campo in CAMPOS_DOC_POR_NOMBRE
}

// ── Vacío / presente ────────────────────────────────────────────────────────

/**
 * Un campo está vacío si no hay nada que enseñar: null, undefined, string en
 * blanco o NaN. El 0 NO está vacío — un coche con 0 km es un coche nuevo, y un
 * precio de 0 es un dato, no un hueco.
 */
export function vacio(v: unknown): boolean {
  if (v === null || v === undefined) return true
  if (typeof v === 'string') return v.trim() === ''
  if (typeof v === 'number') return !Number.isFinite(v)
  return false
}

// ── A · faltantesAlta ───────────────────────────────────────────────────────

/** Lo que llega en el body del alta (o el formulario). Claves sueltas. */
export type DatosAlta = Record<string, unknown>

function falta(def: CampoDef, etiqueta = def.etiqueta): Faltante {
  return {
    campo: def.campo,
    etiqueta,
    motivo: `Falta ${etiqueta.toLowerCase()}.`,
  }
}

/**
 * Campos obligatorios que faltan para dar de alta el coche, en el orden del
 * formulario. Vacío = se puede crear.
 *
 * Condicionales: tipo I exige inversor; tipo D renombra el precio de compra a
 * «precio acordado con el cliente» (mismo campo, otra etiqueta).
 */
export function faltantesAlta(datos: DatosAlta): Faltante[] {
  const tipo: TipoVehiculo | null = normalizarTipo(datos.tipo as string)
  const out: Faltante[] = []

  for (const def of CAMPOS_ALTA) {
    const etiqueta =
      def.campo === 'precioCompra' && tipo === 'D'
        ? ETIQUETA_PRECIO_DEPOSITO
        : def.etiqueta
    if (vacio(datos[def.campo])) out.push(falta(def, etiqueta))
    // El tipo, además de estar, tiene que ser reconocible.
    if (def.campo === 'tipo' && !vacio(datos.tipo) && !tipo) {
      out.push({
        campo: 'tipo',
        etiqueta: def.etiqueta,
        motivo: `Tipo de vehículo no reconocido: '${String(datos.tipo)}'.`,
      })
    }
  }

  if (tipo === 'I') {
    const id = datos.inversorId
    const n = typeof id === 'string' ? Number(id) : id
    if (vacio(id) || typeof n !== 'number' || !Number.isFinite(n) || n <= 0) {
      out.push({
        campo: 'inversorId',
        etiqueta: CAMPO_INVERSOR.etiqueta,
        motivo: 'Un coche de inversor necesita un inversor asignado.',
      })
    }
  }

  return out
}

// ── P · faltantesPublicar ───────────────────────────────────────────────────

/** Lo que el bloqueo de publicación necesita de la fila de "Vehiculo". */
export interface VehiculoPublicable {
  color?: unknown
  bastidor?: unknown
  fechaMatriculacion?: unknown
  precioPublicacion?: unknown
}

/** Lo que necesita de vehiculo_ficha_comercial. `null` = el coche no tiene ficha. */
export type FichaPublicable = Record<string, unknown> | null | undefined

function valorDe(
  def: CampoDef,
  vehiculo: VehiculoPublicable,
  ficha: FichaPublicable
): unknown {
  if (def.tabla === 'ficha') return ficha?.[def.columna]
  // precio_contado es alias de "Vehiculo"."precioPublicacion".
  return (vehiculo as Record<string, unknown>)?.[def.columna]
}

/**
 * Campos que impiden pasar el coche a PUBLICADO. Vacío = se puede publicar.
 *
 * Dos motivos distintos, y la diferencia importa para quien lo lee:
 *  · vacío        → nadie lo ha rellenado todavía.
 *  · sin confirmar → lo rellenó el permiso de circulación leído por IA y nadie
 *                    ha dicho que sea correcto (vehiculo_campos_doc).
 *
 * `pendientes` son los nombres de campo con confirmado_at IS NULL. Un campo D
 * relleno y sin fila en vehiculo_campos_doc está confirmado por definición: lo
 * escribió una persona a mano.
 *
 * Sólo se aplica a PUBLICADO. VENDIDO, RESERVADO y los estados de preparación
 * no pasan por aquí: bloquear una venta por una casilla vacía sería peor que el
 * dato que falta.
 */
export function faltantesPublicar(
  vehiculo: VehiculoPublicable,
  ficha: FichaPublicable,
  pendientes: readonly string[] = []
): Faltante[] {
  const pendiente = new Set(pendientes)
  const out: Faltante[] = []
  const vistos = new Set<string>()

  const revisar = (def: CampoDef, exigirConfirmacion: boolean) => {
    if (vistos.has(def.campo)) return
    vistos.add(def.campo)
    if (vacio(valorDe(def, vehiculo, ficha))) {
      out.push({
        campo: def.campo,
        etiqueta: def.etiqueta,
        motivo: `Falta ${def.etiqueta.toLowerCase()}.`,
      })
      return
    }
    if (exigirConfirmacion && pendiente.has(def.campo)) {
      out.push({
        campo: def.campo,
        etiqueta: def.etiqueta,
        motivo: `${def.etiqueta}: lo rellenó el permiso de circulación y falta confirmarlo.`,
      })
    }
  }

  // Los D primero: son los que más veces faltan y los que hay que confirmar.
  for (const def of CAMPOS_DOC) revisar(def, true)
  for (const def of CAMPOS_PUBLICAR) revisar(def, true)

  return out
}

/** Resumen de una línea para toasts y mensajes de error de la API. */
export function resumenFaltantes(faltantes: readonly Faltante[]): string {
  if (faltantes.length === 0) return ''
  return faltantes.map((f) => f.etiqueta).join(', ')
}

/**
 * Orquestación del presupuesto (server-only): vehículo + ficha comercial +
 * contexto (params/tarifas) + motor puro, PDF y proyección pública.
 */
import { pool } from '@/lib/direct-database'
import { dateToYMD } from '@/lib/fechas'
import {
  leerFicha,
  parseNumeroFicha,
  TARIFAS,
  type FichaComercial,
} from '@/lib/fichaComercial'
import { calcularPresupuesto, hoyMadrid } from './calculo'
import {
  nombrePdfPresupuesto,
  telefonoWhatsAppEmpresa,
  urlPublicaPresupuesto,
  urlReserva,
} from './enlaces'
import { generarPresupuestoPdf } from './pdf'
import {
  actualizarPresupuesto,
  cargarContextoCalculo,
  type ContextoCalculo,
  type PresupuestoRow,
  type VersionParametros,
} from './repo'
import { subirPdfPresupuesto } from './storage'
import {
  OPCIONES_DEFECTO,
  type EstadoPresupuesto,
  type ModoEntrega,
  type OpcionesPresupuesto,
  type ParametrosPresupuesto,
  type ResultadoCalculo,
  type TarifaFinanciacion,
  type VehiculoCalculo,
} from './tipos'

export interface VehiculoPresupuesto {
  id: number
  referencia: string
  marca: string
  modelo: string
  matricula: string
  kms: number | null
  color: string | null
  /** 'YYYY-MM-DD' */
  fechaMatriculacion: string | null
  anio: number | null
  estado: string | null
  dealActivoId: number | null
  venta: { dealId?: number | null } | null
}

export interface PresupuestoPublico {
  numero: string
  estado: EstadoPresupuesto
  validoHasta: string
  vencido: boolean
  fecha: string
  cliente: { nombre: string }
  vehiculo: {
    nombre: string
    marca: string
    modelo: string
    matricula: string
    kms: number | null
    fechaMatriculacion: string | null
    color: string | null
    combustible: string | null
    caja: string | null
    motor_cv: number | null
    cubicaje: number | null
    url_imagen: string | null
    mantenimientos: string | null
  }
  calculo: ResultadoCalculo
  reservaUrl: string
  whatsapp: { telefono: string | null }
  pdfDisponible: boolean
}

export type ErrorConstruccion = 'VEHICULO_NO_ENCONTRADO' | 'SIN_PRECIO'

export interface PresupuestoConstruido {
  vehiculo: VehiculoPresupuesto
  ficha: FichaComercial
  contexto: ContextoCalculo
  calculo: ResultadoCalculo
}

function numOrNull(v: unknown): number | null {
  if (v == null || v === '') return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

function texto(v: unknown): string {
  return String(v ?? '').trim()
}

export async function cargarVehiculoPresupuesto(
  id: number
): Promise<VehiculoPresupuesto | null> {
  const r = await pool.query(
    `SELECT v.id, v.referencia, v.marca, v.modelo, v.matricula, v.kms, v.color,
            v."fechaMatriculacion", v."año" AS anio, v.estado, v."dealActivoId"
       FROM "Vehiculo" v WHERE v.id = $1`,
    [id]
  )
  const row = r.rows[0]
  if (!row) return null
  return {
    id: Number(row.id),
    referencia: texto(row.referencia),
    marca: texto(row.marca),
    modelo: texto(row.modelo),
    matricula: texto(row.matricula),
    kms: numOrNull(row.kms),
    color: row.color == null ? null : texto(row.color) || null,
    fechaMatriculacion: dateToYMD(row.fechaMatriculacion),
    anio: numOrNull(row.anio),
    estado: row.estado == null ? null : String(row.estado),
    dealActivoId: numOrNull(row.dealActivoId),
    venta: null,
  }
}

export function vehiculoCalculoDe(
  v: VehiculoPresupuesto,
  f: FichaComercial
): VehiculoCalculo {
  return {
    precio_contado: f.precio_contado ?? 0,
    tarifa_financiacion: f.tarifa_financiacion,
    gp: f.gp,
    fecha_matriculacion: v.fechaMatriculacion,
    meses_garantia_fabrica: f.meses_garantia_fabrica,
  }
}

export function nombreVehiculo(
  v: Pick<VehiculoPresupuesto, 'marca' | 'modelo'>,
  f: Pick<FichaComercial, 'nombre_comercial'> | null
): string {
  const comercial = texto(f?.nombre_comercial)
  if (comercial) return comercial
  return [v.marca, v.modelo].map(texto).filter(Boolean).join(' ')
}

// ── Validación de opciones ──────────────────────────────────────────────────

const MODOS_PLAZO = ['NORMAL', 'CORTO'] as const
const MODOS_ENTREGA = ['JUNTO', 'SEPARADO'] as const
const SUSTITUCION = ['auto', 'si', 'no'] as const
const MAX_CONCEPTO = 80

export type OpcionesNormalizadas =
  | { ok: true; opciones: OpcionesPresupuesto }
  | { ok: false; errores: string[] }

/**
 * Body → OpcionesPresupuesto. Claves ausentes → valor por defecto; presentes
 * → validación estricta (booleanos, enums, importes >= 0 admitiendo "1.500,00").
 */
export function normalizarOpciones(body: unknown): OpcionesNormalizadas {
  if (body == null || typeof body !== 'object' || Array.isArray(body)) {
    return { ok: false, errores: ['opciones: debe ser un objeto'] }
  }
  const b = body as Record<string, unknown>
  const errores: string[] = []
  const out: OpcionesPresupuesto = { ...OPCIONES_DEFECTO }

  const importe = (k: string, v: unknown): number | null => {
    if (v == null || v === '') return null
    const n = parseNumeroFicha(v)
    if (n == null) {
      errores.push(`${k}: no numérico`)
      return null
    }
    if (n < 0) {
      errores.push(`${k}: debe ser >= 0`)
      return null
    }
    return n
  }
  const enumDe = <T extends string>(
    k: string,
    v: unknown,
    valores: readonly T[]
  ): T | null => {
    if ((valores as readonly string[]).includes(String(v))) return v as T
    errores.push(`${k}: debe ser ${valores.join('|')}`)
    return null
  }

  if ('financia' in b) {
    if (typeof b.financia === 'boolean') out.financia = b.financia
    else errores.push('financia: debe ser booleano')
  }
  if ('modoPlazo' in b) {
    const m = enumDe('modoPlazo', b.modoPlazo, MODOS_PLAZO)
    if (m) out.modoPlazo = m
  }
  if ('entrada' in b) {
    const n = importe('entrada', b.entrada)
    out.entrada = n ? n : null
  }
  if ('cocheEntrega' in b) {
    const c = b.cocheEntrega
    if (c == null) out.cocheEntrega = null
    else if (typeof c !== 'object' || Array.isArray(c)) {
      errores.push('cocheEntrega: debe ser un objeto o null')
    } else {
      const ce = c as Record<string, unknown>
      const valor = importe('cocheEntrega.valor', ce.valor)
      const modo = enumDe('cocheEntrega.modo', ce.modo, MODOS_ENTREGA)
      if (valor != null && modo) {
        out.cocheEntrega =
          valor > 0 ? { valor, modo: modo as ModoEntrega } : null
      }
    }
  }
  if ('prestamoPendiente' in b) {
    const n = importe('prestamoPendiente', b.prestamoPendiente)
    out.prestamoPendiente = n ? n : null
  }
  if ('extra' in b) {
    const e = b.extra
    if (e == null) out.extra = null
    else if (typeof e !== 'object' || Array.isArray(e)) {
      errores.push('extra: debe ser un objeto o null')
    } else {
      const ex = e as Record<string, unknown>
      const concepto = texto(ex.concepto)
      if (!concepto) errores.push('extra.concepto: obligatorio')
      else if (concepto.length > MAX_CONCEPTO)
        errores.push(`extra.concepto: máximo ${MAX_CONCEPTO} caracteres`)
      const imp = importe('extra.importe', ex.importe)
      if (concepto && concepto.length <= MAX_CONCEPTO && imp != null) {
        out.extra = imp > 0 ? { concepto, importe: imp } : null
      } else if (imp == null && !errores.some((x) => x.startsWith('extra.'))) {
        errores.push('extra.importe: obligatorio')
      }
    }
  }
  if ('sustitucion' in b) {
    const s = enumDe('sustitucion', b.sustitucion, SUSTITUCION)
    if (s) out.sustitucion = s
  }
  if ('tarifaOverride' in b) {
    if (b.tarifaOverride == null || b.tarifaOverride === '') {
      out.tarifaOverride = null
    } else {
      const t = enumDe('tarifaOverride', b.tarifaOverride, TARIFAS)
      if (t) out.tarifaOverride = t as TarifaFinanciacion
    }
  }

  if (errores.length) return { ok: false, errores }
  return { ok: true, opciones: out }
}

// ── Construcción ────────────────────────────────────────────────────────────

export async function construirPresupuesto(
  vehiculoId: number,
  opciones: OpcionesPresupuesto,
  hoy = hoyMadrid()
): Promise<PresupuestoConstruido | { error: ErrorConstruccion }> {
  const [vehiculo, ficha, contexto] = await Promise.all([
    cargarVehiculoPresupuesto(vehiculoId),
    leerFicha(vehiculoId),
    cargarContextoCalculo(hoy),
  ])
  if (!vehiculo || !ficha) return { error: 'VEHICULO_NO_ENCONTRADO' }
  if (!(ficha.precio_contado && ficha.precio_contado > 0)) {
    return { error: 'SIN_PRECIO' }
  }
  const calculo = calcularPresupuesto({
    vehiculo: vehiculoCalculoDe(vehiculo, ficha),
    opciones,
    params: contexto.params,
    tarifaPremium: contexto.tarifaPremium,
    tarifaSinPremium: contexto.tarifaSinPremium,
    hoy: contexto.hoy,
  })
  return { vehiculo, ficha, contexto, calculo }
}

export function versionDe(c: ContextoCalculo): VersionParametros {
  return {
    params: c.params,
    tarifaPremium: c.tarifaPremium,
    tarifaSinPremium: c.tarifaSinPremium,
  }
}

// ── Proyección pública ──────────────────────────────────────────────────────

export function aPublico(
  p: PresupuestoRow,
  v: VehiculoPresupuesto,
  f: FichaComercial | null,
  params: ParametrosPresupuesto,
  hoy = hoyMadrid()
): PresupuestoPublico {
  const vencido =
    p.estado === 'vencido' ||
    (p.estado !== 'aceptado' && !!p.valido_hasta && p.valido_hasta < hoy)
  return {
    numero: p.numero,
    estado: p.estado,
    validoHasta: p.valido_hasta,
    vencido,
    fecha: p.calculo.hoy,
    cliente: { nombre: p.nombre_cliente },
    vehiculo: {
      nombre: nombreVehiculo(v, f),
      marca: v.marca,
      modelo: v.modelo,
      matricula: v.matricula,
      kms: v.kms,
      fechaMatriculacion: v.fechaMatriculacion,
      color: v.color,
      combustible: f?.combustible ?? null,
      caja: f?.caja ?? null,
      motor_cv: f?.motor_cv ?? null,
      cubicaje: f?.cubicaje ?? null,
      url_imagen: f?.url_imagen ?? null,
      mantenimientos: f?.mantenimientos ?? null,
    },
    calculo: p.calculo,
    reservaUrl: urlReserva(f?.url_qr, params.reserva_url_defecto),
    whatsapp: { telefono: telefonoWhatsAppEmpresa(params.whatsapp_empresa) },
    pdfDisponible: !!p.pdf_url,
  }
}

// ── PDF ─────────────────────────────────────────────────────────────────────

export interface PdfPresupuesto {
  bytes: Uint8Array
  nombreArchivo: string
  pdf_url: string | null
}

export function nombreArchivoDe(
  p: Pick<PresupuestoRow, 'numero'>,
  v: Pick<VehiculoPresupuesto, 'marca' | 'modelo' | 'matricula'>,
  f: Pick<FichaComercial, 'nombre_comercial'> | null
): string {
  return nombrePdfPresupuesto(p.numero, {
    nombre_comercial: f?.nombre_comercial,
    marca: v.marca,
    modelo: v.modelo,
    matricula: v.matricula,
  })
}

/** Genera el PDF desde el `calculo` guardado (vehículo/ficha actuales para foto y ficha técnica). */
export async function generarPdfDe(p: PresupuestoRow): Promise<PdfPresupuesto> {
  const [vehiculo, ficha] = await Promise.all([
    cargarVehiculoPresupuesto(p.vehiculo_id),
    leerFicha(p.vehiculo_id),
  ])
  if (!vehiculo) throw new Error('Vehículo del presupuesto no encontrado')
  const bytes = await generarPresupuestoPdf({
    numero: p.numero,
    fecha: p.calculo.hoy,
    validoHasta: p.valido_hasta || p.calculo.validoHasta,
    nombreCliente: p.nombre_cliente,
    vehiculo,
    ficha,
    calculo: p.calculo,
    urlPublica: urlPublicaPresupuesto(p.token_publico),
    params: p.version_parametros.params,
  })
  return {
    bytes,
    nombreArchivo: nombreArchivoDe(p, vehiculo, ficha),
    pdf_url: p.pdf_url,
  }
}

/** Genera, sube a Blob y guarda pdf_url. Lanza BlobNoConfiguradoError sin token. */
export async function generarYSubirPdf(
  p: PresupuestoRow
): Promise<PdfPresupuesto> {
  const pdf = await generarPdfDe(p)
  const subido = await subirPdfPresupuesto(pdf.nombreArchivo, pdf.bytes)
  await actualizarPresupuesto(p.id, { pdf_url: subido.url })
  return { ...pdf, pdf_url: subido.url }
}

/** PDF ya subido (descarga del Blob) o lo genera y sube si no existe. */
export async function obtenerPdf(p: PresupuestoRow): Promise<PdfPresupuesto> {
  if (p.pdf_url) {
    const res = await fetch(p.pdf_url)
    if (res.ok) {
      const [vehiculo, ficha] = await Promise.all([
        cargarVehiculoPresupuesto(p.vehiculo_id),
        leerFicha(p.vehiculo_id),
      ])
      return {
        bytes: new Uint8Array(await res.arrayBuffer()),
        nombreArchivo: nombreArchivoDe(
          p,
          vehiculo ?? { marca: '', modelo: '', matricula: '' },
          ficha
        ),
        pdf_url: p.pdf_url,
      }
    }
    console.warn(
      `[presupuestos] pdf_url no accesible (${res.status}); regenerando`
    )
  }
  return generarYSubirPdf(p)
}

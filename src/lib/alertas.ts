/**
 * Alertas operativas del CRM (A1). Hasta ahora nada avisaba de nada: los
 * recordatorios eran una lista que alguien miraba. Este módulo detecta las
 * situaciones que requieren acción y las lleva a dos sitios: la bandeja
 * /revision (origen 'alertas') y un email diario (renderDigest).
 *
 * Tipos:
 *  · reserva-caducada / reserva-por-vencer  (Deal.fechaReservaExpira)
 *  · recordatorio-vencido                   (tablas *Recordatorios / ClienteReminder)
 *  · cambio-nombre                          (facturado sin documentacionRetirada > 7 días)
 *  · cobro-pendiente                        (vendido/facturado con restoAPagar > 0 > 7 días)
 *  · stock-parado / margen-negativo         (lib/stockAging)
 *
 * Decisiones:
 *  · Cobro pendiente usa "restoAPagar" tal cual: `pagosResto` está tipado pero
 *    ningún flujo lo escribe, así que no hay nada que restar.
 *  · La bandeja se alimenta con ON CONFLICT DO NOTHING sobre dedup_key
 *    'alertas:<tipo>:<ref>'. Nunca se cierra ni se reabre nada automáticamente:
 *    si la alerta deja de aplicar, el ítem pendiente lo resuelve una persona;
 *    si ya se resolvió, no se vuelve a encolar (el email sí la sigue listando
 *    mientras la condición persista).
 *  · Cada detector va en su propio try/catch: un fallo no tumba a los demás.
 */

import { pool } from '@/lib/direct-database'
import { getStockAging } from '@/lib/stockAging'
import { escapeHtml } from '@/lib/cronNotify'

export type TipoAlerta =
  | 'reserva-caducada'
  | 'reserva-por-vencer'
  | 'recordatorio-vencido'
  | 'cambio-nombre'
  | 'cobro-pendiente'
  | 'stock-parado'
  | 'margen-negativo'

export type Severidad = 'alta' | 'media'

export interface Alerta {
  tipo: TipoAlerta
  severidad: Severidad
  /** 'deal:123' / 'vehiculo:45' / 'recordatorio:deal:7' */
  ref: string
  titulo: string
  detalle: string
  /** Ruta interna del CRM, p.ej. /deals/123 */
  url: string
}

export interface ErrorDetector {
  tipo: string
  error: string
}

export interface ResultadoDeteccion {
  alertas: Alerta[]
  errores: ErrorDetector[]
}

export const TIPO_LABEL: Record<TipoAlerta, string> = {
  'reserva-caducada': 'Reservas caducadas',
  'reserva-por-vencer': 'Reservas que vencen en 2 días',
  'recordatorio-vencido': 'Recordatorios vencidos',
  'cambio-nombre': 'Cambios de nombre sin cerrar',
  'cobro-pendiente': 'Cobros pendientes',
  'stock-parado': 'Stock parado (> 90 días)',
  'margen-negativo': 'Margen negativo',
}

const ORDEN_TIPOS: TipoAlerta[] = [
  'reserva-caducada',
  'cobro-pendiente',
  'cambio-nombre',
  'recordatorio-vencido',
  'reserva-por-vencer',
  'margen-negativo',
  'stock-parado',
]

const DIA_MS = 86_400_000

const fmtFecha = new Intl.DateTimeFormat('es-ES', {
  timeZone: 'Europe/Madrid',
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
})

export function formatearFecha(d: Date | string | null | undefined): string {
  if (!d) return '—'
  const date = d instanceof Date ? d : new Date(d)
  return isNaN(date.getTime()) ? '—' : fmtFecha.format(date)
}

function diasEntre(desde: Date | string, hasta: Date): number {
  const d = desde instanceof Date ? desde : new Date(desde)
  return Math.floor((hasta.getTime() - d.getTime()) / DIA_MS)
}

function euros(n: number): string {
  // Separador de miles fijo: Intl es-ES no agrupa cifras de 4 dígitos (1501).
  const entero = String(Math.abs(Math.round(n))).replace(
    /\B(?=(\d{3})+(?!\d))/g,
    '.'
  )
  return `${n < 0 ? '-' : ''}${entero} €`
}

function nombreCliente(r: {
  cliente_nombre?: string | null
  cliente_apellidos?: string | null
}) {
  return (
    [r.cliente_nombre, r.cliente_apellidos].filter(Boolean).join(' ').trim() ||
    'sin cliente'
  )
}

function coche(r: {
  vehiculo_marca?: string | null
  vehiculo_modelo?: string | null
  vehiculo_matricula?: string | null
}) {
  const base = [r.vehiculo_marca, r.vehiculo_modelo]
    .filter(Boolean)
    .join(' ')
    .trim()
  const mat = r.vehiculo_matricula ? ` (${r.vehiculo_matricula})` : ''
  return (base || 'vehículo') + mat
}

// ─── Detectores ──────────────────────────────────────────────────────────

interface DealRow {
  id: number
  numero: string | null
  cliente_nombre: string | null
  cliente_apellidos: string | null
  vehiculo_marca: string | null
  vehiculo_modelo: string | null
  vehiculo_matricula: string | null
}

const DEAL_JOINS = `FROM "Deal" d
         LEFT JOIN "Cliente" c ON c.id = d."clienteId"
         LEFT JOIN "Vehiculo" v ON v.id = d."vehiculoId"`

const DEAL_COLS = `d.id, d.numero,
              c.nombre AS cliente_nombre, c.apellidos AS cliente_apellidos,
              v.marca AS vehiculo_marca, v.modelo AS vehiculo_modelo, v.matricula AS vehiculo_matricula`

async function detectarReservas(hoy: Date): Promise<Alerta[]> {
  const res = await pool.query<DealRow & { fechaReservaExpira: Date }>(
    `SELECT ${DEAL_COLS}, d."fechaReservaExpira"
       ${DEAL_JOINS}
      WHERE d.estado = 'reservado'
        AND d."fechaReservaExpira" IS NOT NULL
        AND d."fechaReservaExpira" < $1::timestamptz + interval '2 days'
      ORDER BY d."fechaReservaExpira" ASC`,
    [hoy]
  )
  return res.rows.map((r) => {
    const expira = new Date(r.fechaReservaExpira)
    const caducada = expira.getTime() < hoy.getTime()
    const dias = Math.abs(diasEntre(expira, hoy))
    return {
      tipo: caducada ? 'reserva-caducada' : 'reserva-por-vencer',
      severidad: caducada ? 'alta' : 'media',
      ref: `deal:${r.id}`,
      titulo: `${caducada ? 'Reserva caducada' : 'Reserva por vencer'}: ${r.numero ?? `#${r.id}`} · ${nombreCliente(r)} · ${coche(r)}`,
      detalle: caducada
        ? `Venció el ${formatearFecha(expira)} (hace ${dias} día${dias === 1 ? '' : 's'}) y el deal sigue en "reservado".`
        : `Vence el ${formatearFecha(expira)}${dias === 0 ? ' (hoy)' : dias === 1 ? ' (mañana)' : ''}.`,
      url: `/deals/${r.id}`,
    }
  })
}

interface RecordatorioFuente {
  entidad: 'deal' | 'vehiculo' | 'cliente' | 'deposito' | 'inversor'
  sql: string
  url: (entidadId: number) => string
}

interface RecordatorioRow {
  id: number
  entidad_id: number
  titulo: string | null
  prioridad: string | null
  fecha: Date
  etiqueta: string | null
}

// Cada fuente devuelve las mismas columnas; una query por tabla para que una
// tabla ausente (schema drift, ver dashboard/recordatorios) no tumbe al resto.
const FUENTES_RECORDATORIOS: RecordatorioFuente[] = [
  {
    entidad: 'deal',
    sql: `SELECT r.id, r.deal_id AS entidad_id, r.titulo, r.prioridad, r.fecha_recordatorio AS fecha,
                 COALESCE(d.numero, '#' || r.deal_id) || ' · ' ||
                 COALESCE(NULLIF(TRIM(COALESCE(c.nombre, '') || ' ' || COALESCE(c.apellidos, '')), ''), 'sin cliente') AS etiqueta
            FROM "DealRecordatorios" r
            LEFT JOIN "Deal" d ON d.id = r.deal_id
            LEFT JOIN "Cliente" c ON c.id = d."clienteId"
           WHERE COALESCE(r.completado, false) = false AND r.fecha_recordatorio <= $1::timestamptz
           ORDER BY r.fecha_recordatorio ASC`,
    url: (id) => `/deals/${id}`,
  },
  {
    entidad: 'vehiculo',
    sql: `SELECT r.id, r.vehiculo_id AS entidad_id, r.titulo, r.prioridad, r.fecha_recordatorio AS fecha,
                 NULLIF(TRIM(COALESCE(v.marca, '') || ' ' || COALESCE(v.modelo, '') ||
                   CASE WHEN v.matricula IS NOT NULL THEN ' (' || v.matricula || ')' ELSE '' END), '') AS etiqueta
            FROM "VehiculoRecordatorios" r
            LEFT JOIN "Vehiculo" v ON v.id = r.vehiculo_id
           WHERE COALESCE(r.completado, false) = false AND r.fecha_recordatorio <= $1::timestamptz
           ORDER BY r.fecha_recordatorio ASC`,
    url: (id) => `/vehiculos/${id}`,
  },
  {
    entidad: 'cliente',
    sql: `SELECT r.id, r."clienteId" AS entidad_id, r.titulo, r.prioridad, r."fechaRecordatorio" AS fecha,
                 NULLIF(TRIM(COALESCE(c.nombre, '') || ' ' || COALESCE(c.apellidos, '')), '') AS etiqueta
            FROM "ClienteReminder" r
            LEFT JOIN "Cliente" c ON c.id = r."clienteId"
           WHERE COALESCE(r.completado, false) = false AND r."fechaRecordatorio" <= $1::timestamptz
           ORDER BY r."fechaRecordatorio" ASC`,
    url: (id) => `/clientes/${id}`,
  },
  {
    entidad: 'deposito',
    sql: `SELECT r.id, r.deposito_id AS entidad_id, r.titulo, r.prioridad, r.fecha_recordatorio AS fecha,
                 'Depósito #' || r.deposito_id AS etiqueta
            FROM "DepositoRecordatorios" r
           WHERE COALESCE(r.completado, false) = false AND r.fecha_recordatorio <= $1::timestamptz
           ORDER BY r.fecha_recordatorio ASC`,
    url: (id) => `/depositos/${id}`,
  },
  {
    entidad: 'inversor',
    sql: `SELECT r.id, r.inversor_id AS entidad_id, r.titulo, r.prioridad, r.fecha_recordatorio AS fecha,
                 i.nombre AS etiqueta
            FROM "InversorRecordatorios" r
            LEFT JOIN "Inversor" i ON i.id = r.inversor_id
           WHERE COALESCE(r.completado, false) = false AND r.fecha_recordatorio <= $1::timestamptz
           ORDER BY r.fecha_recordatorio ASC`,
    url: (id) => `/inversores/${id}`,
  },
]

const ENTIDAD_LABEL: Record<RecordatorioFuente['entidad'], string> = {
  deal: 'Deal',
  vehiculo: 'Vehículo',
  cliente: 'Cliente',
  deposito: 'Depósito',
  inversor: 'Inversor',
}

async function detectarRecordatorios(
  hoy: Date,
  errores: ErrorDetector[]
): Promise<Alerta[]> {
  const out: Alerta[] = []
  for (const f of FUENTES_RECORDATORIOS) {
    try {
      const res = await pool.query<RecordatorioRow>(f.sql, [hoy])
      for (const r of res.rows) {
        const dias = diasEntre(r.fecha, hoy)
        out.push({
          tipo: 'recordatorio-vencido',
          severidad:
            (r.prioridad ?? '').toLowerCase() === 'alta' || dias >= 3
              ? 'alta'
              : 'media',
          ref: `recordatorio:${f.entidad}:${r.id}`,
          titulo: `Recordatorio vencido (${ENTIDAD_LABEL[f.entidad]}): ${r.titulo ?? 'sin título'}${r.etiqueta ? ` · ${r.etiqueta}` : ''}`,
          detalle: `Programado para el ${formatearFecha(r.fecha)}${dias > 0 ? ` (hace ${dias} día${dias === 1 ? '' : 's'})` : ' (hoy)'} y sigue sin completar.`,
          url: f.url(r.entidad_id),
        })
      }
    } catch (err) {
      const code = (err as { code?: string }).code
      // 42P01 = la tabla no existe en esta DB (drift conocido): no es un fallo.
      if (code === '42P01') continue
      errores.push({
        tipo: `recordatorio-vencido:${f.entidad}`,
        error: (err as Error).message ?? String(err),
      })
    }
  }
  return out
}

async function detectarCambioNombre(hoy: Date): Promise<Alerta[]> {
  const res = await pool.query<
    DealRow & {
      cambioNombreSolicitado: boolean | null
      documentacionRecibida: boolean | null
      clienteAvisado: boolean | null
      desde: Date | null
    }
  >(
    `SELECT ${DEAL_COLS},
            d."cambioNombreSolicitado", d."documentacionRecibida", d."clienteAvisado",
            COALESCE(GREATEST(d."fechaFacturada", d.cambio_nombre_solicitado_at,
                              d.documentacion_recibida_at, d.cliente_avisado_at),
                     d."updatedAt") AS desde
       ${DEAL_JOINS}
      WHERE d.estado = 'facturado'
        AND COALESCE(d."documentacionRetirada", false) = false
        AND COALESCE(GREATEST(d."fechaFacturada", d.cambio_nombre_solicitado_at,
                              d.documentacion_recibida_at, d.cliente_avisado_at),
                     d."updatedAt") < $1::timestamptz - interval '7 days'
      ORDER BY desde ASC`,
    [hoy]
  )
  return res.rows.map((r) => {
    const paso = !r.cambioNombreSolicitado
      ? 'cambio de nombre sin solicitar'
      : !r.documentacionRecibida
        ? 'documentación sin recibir'
        : !r.clienteAvisado
          ? 'cliente sin avisar'
          : 'documentación sin retirar'
    const dias = r.desde ? diasEntre(r.desde, hoy) : 0
    return {
      tipo: 'cambio-nombre',
      severidad: dias > 14 ? 'alta' : 'media',
      ref: `deal:${r.id}`,
      titulo: `Cambio de nombre abierto: ${r.numero ?? `#${r.id}`} · ${nombreCliente(r)} · ${coche(r)}`,
      detalle: `Facturado y ${paso}; último paso hace ${dias} días (${formatearFecha(r.desde)}).`,
      url: `/deals/${r.id}`,
    }
  })
}

async function detectarCobrosPendientes(hoy: Date): Promise<Alerta[]> {
  const res = await pool.query<
    DealRow & { estado: string; restoAPagar: number; desde: Date | null }
  >(
    `SELECT ${DEAL_COLS}, d.estado, d."restoAPagar"::float AS "restoAPagar",
            COALESCE(d."fechaVentaFirmada", d."fechaFacturada", d."updatedAt") AS desde
       ${DEAL_JOINS}
      WHERE d.estado IN ('vendido', 'facturado')
        AND d."restoAPagar" > 0
        AND COALESCE(d."fechaVentaFirmada", d."fechaFacturada", d."updatedAt") < $1::timestamptz - interval '7 days'
      ORDER BY desde ASC`,
    [hoy]
  )
  return res.rows.map((r) => {
    const dias = r.desde ? diasEntre(r.desde, hoy) : 0
    return {
      tipo: 'cobro-pendiente',
      severidad: dias > 30 ? 'alta' : 'media',
      ref: `deal:${r.id}`,
      titulo: `Cobro pendiente: ${euros(Number(r.restoAPagar))} · ${r.numero ?? `#${r.id}`} · ${nombreCliente(r)} · ${coche(r)}`,
      detalle: `Deal ${r.estado} desde el ${formatearFecha(r.desde)} (hace ${dias} días) con resto a pagar de ${euros(Number(r.restoAPagar))}.`,
      url: `/deals/${r.id}`,
    }
  })
}

async function detectarStock(): Promise<Alerta[]> {
  const { vehiculos } = await getStockAging()
  const out: Alerta[] = []
  for (const v of vehiculos) {
    const nombre = `${[v.marca, v.modelo].filter(Boolean).join(' ') || 'vehículo'}${v.matricula ? ` (${v.matricula})` : ''}${v.referencia ? ` · ref ${v.referencia}` : ''}`
    if (v.alertas.includes('margen-negativo')) {
      out.push({
        tipo: 'margen-negativo',
        severidad: 'alta',
        ref: `vehiculo:${v.id}`,
        titulo: `Margen negativo: ${nombre}`,
        detalle: `Coste total ${euros(v.costeTotal)} frente a precio previsto ${euros((v.precioVenta ?? v.precioPublicacion) as number)}: margen ${euros(v.margenEstimado ?? 0)}.`,
        url: `/vehiculos/${v.id}`,
      })
    }
    if (v.alertas.includes('aging-90')) {
      out.push({
        tipo: 'stock-parado',
        severidad: v.diasEnStock > 180 ? 'alta' : 'media',
        ref: `vehiculo:${v.id}`,
        titulo: `Stock parado: ${nombre}`,
        detalle: `${v.diasEnStock} días en stock (estado ${v.estado ?? '—'}), coste inmovilizado ${euros(v.costeTotal)}.`,
        url: `/vehiculos/${v.id}`,
      })
    }
  }
  return out
}

// ─── API pública ─────────────────────────────────────────────────────────

export async function detectarAlertasConErrores(
  hoy: Date = new Date()
): Promise<ResultadoDeteccion> {
  const alertas: Alerta[] = []
  const errores: ErrorDetector[] = []

  const detectores: Array<[string, () => Promise<Alerta[]>]> = [
    ['reservas', () => detectarReservas(hoy)],
    ['recordatorios', () => detectarRecordatorios(hoy, errores)],
    ['cambio-nombre', () => detectarCambioNombre(hoy)],
    ['cobro-pendiente', () => detectarCobrosPendientes(hoy)],
    ['stock', () => detectarStock()],
  ]
  // Secuencial a propósito: el pool de Vercel está capado a 1 conexión.
  for (const [tipo, fn] of detectores) {
    try {
      alertas.push(...(await fn()))
    } catch (err) {
      errores.push({ tipo, error: (err as Error).message ?? String(err) })
    }
  }

  const sev = (s: Severidad) => (s === 'alta' ? 0 : 1)
  alertas.sort(
    (a, b) =>
      ORDEN_TIPOS.indexOf(a.tipo) - ORDEN_TIPOS.indexOf(b.tipo) ||
      sev(a.severidad) - sev(b.severidad)
  )
  return { alertas, errores }
}

export async function detectarAlertas(
  hoy: Date = new Date()
): Promise<Alerta[]> {
  return (await detectarAlertasConErrores(hoy)).alertas
}

export function dedupKey(a: Pick<Alerta, 'tipo' | 'ref'>): string {
  return `alertas:${a.tipo}:${a.ref}`
}

/**
 * Encola las alertas en revision_items (origen 'alertas'). Dedup por
 * dedup_key = 'alertas:<tipo>:<ref>' con ON CONFLICT DO NOTHING; un único
 * INSERT para no pedir más de una conexión. No cierra ni reabre ítems.
 */
export async function sincronizarBandeja(
  alertas: Alerta[]
): Promise<{ nuevos: number; existentes: number }> {
  const porClave = new Map<string, Alerta>()
  for (const a of alertas)
    if (!porClave.has(dedupKey(a))) porClave.set(dedupKey(a), a)
  if (porClave.size === 0) return { nuevos: 0, existentes: 0 }

  const filas = [...porClave.entries()].map(([dedup_key, a]) => ({
    titulo: a.titulo,
    dedup_key,
    payload: {
      tipo: a.tipo,
      severidad: a.severidad,
      ref: a.ref,
      url: a.url,
      detalle: a.detalle,
      // La bandeja muestra payload.motivo como texto destacado.
      motivo: a.detalle,
    },
  }))
  const ins = await pool.query<{ dedup_key: string }>(
    `INSERT INTO revision_items (origen, titulo, payload, dedup_key)
     SELECT 'alertas', x.titulo, x.payload, x.dedup_key
       FROM jsonb_to_recordset($1::jsonb) AS x(titulo text, payload jsonb, dedup_key text)
     ON CONFLICT (dedup_key) DO NOTHING
     RETURNING dedup_key`,
    [JSON.stringify(filas)]
  )
  const nuevos = ins.rows.length
  return { nuevos, existentes: filas.length - nuevos }
}

export function baseUrl(): string {
  return (
    process.env.NEXT_PUBLIC_APP_URL || 'https://sevencars.vercel.app'
  ).replace(/\/+$/, '')
}

export function contarPorTipo(
  alertas: Alerta[]
): Partial<Record<TipoAlerta, number>> {
  const out: Partial<Record<TipoAlerta, number>> = {}
  for (const a of alertas) out[a.tipo] = (out[a.tipo] ?? 0) + 1
  return out
}

/** Email diario: HTML + texto plano agrupado por tipo, con enlaces absolutos. */
export function renderDigest(
  alertas: Alerta[],
  hoy: Date = new Date()
): { subject: string; html: string; text: string } {
  const base = baseUrl()
  const fecha = formatearFecha(hoy)
  const n = alertas.length
  const subject = `Alertas CRM ${fecha}: ${n} aviso${n === 1 ? '' : 's'}`

  const grupos = new Map<TipoAlerta, Alerta[]>()
  for (const t of ORDEN_TIPOS) {
    const items = alertas.filter((a) => a.tipo === t)
    if (items.length) grupos.set(t, items)
  }

  const htmlGrupos = [...grupos.entries()]
    .map(([tipo, items]) => {
      const lis = items
        .map((a) => {
          const sev =
            a.severidad === 'alta'
              ? '<span style="color:#b91c1c;font-weight:600">[ALTA]</span> '
              : ''
          return `<li style="margin:0 0 8px">${sev}<a href="${base}${a.url}" style="color:#1d4ed8">${escapeHtml(a.titulo)}</a><br><span style="color:#475569;font-size:13px">${escapeHtml(a.detalle)}</span></li>`
        })
        .join('')
      return `<h3 style="margin:20px 0 8px;font-size:15px">${escapeHtml(TIPO_LABEL[tipo])} (${items.length})</h3><ul style="padding-left:18px;margin:0">${lis}</ul>`
    })
    .join('')

  const html = `<div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.45;color:#0f172a;max-width:720px">
<h2 style="margin:0 0 4px;font-size:18px">Alertas CRM · ${fecha}</h2>
<p style="margin:0 0 12px;color:#475569">${n} aviso${n === 1 ? '' : 's'} pendiente${n === 1 ? '' : 's'} de acción. Todos están también en la <a href="${base}/revision" style="color:#1d4ed8">bandeja de revisión</a>.</p>
${htmlGrupos || '<p>Sin alertas hoy.</p>'}
<p style="margin:24px 0 0;color:#94a3b8;font-size:12px">Aviso automático diario del CRM SevenCars.</p>
</div>`

  const textGrupos = [...grupos.entries()]
    .map(([tipo, items]) => {
      const lineas = items
        .map(
          (a) =>
            `  - ${a.severidad === 'alta' ? '[ALTA] ' : ''}${a.titulo}\n    ${a.detalle}\n    ${base}${a.url}`
        )
        .join('\n')
      return `${TIPO_LABEL[tipo]} (${items.length})\n${lineas}`
    })
    .join('\n\n')

  const text = `Alertas CRM · ${fecha}\n${n} aviso${n === 1 ? '' : 's'} pendiente${n === 1 ? '' : 's'} de acción. Bandeja: ${base}/revision\n\n${textGrupos || 'Sin alertas hoy.'}\n`

  return { subject, html, text }
}

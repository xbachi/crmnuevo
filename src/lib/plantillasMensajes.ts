/**
 * Plantillas de mensajes al cliente final (email + WhatsApp) para la ficha
 * del deal. Módulo puro: sin red ni env; el contexto llega ya resuelto
 * (ctxDesdeDeal) para que la API y el componente rendericen lo mismo.
 * Textos en tuteo peninsular, sin emojis.
 */

export type PlantillaId =
  | 'reserva_confirmada'
  | 'documentacion_cambio_nombre'
  | 'coche_listo'
  | 'recordatorio_pago'

export const PLANTILLA_IDS: readonly PlantillaId[] = [
  'reserva_confirmada',
  'documentacion_cambio_nombre',
  'coche_listo',
  'recordatorio_pago',
]

export const EMPRESA_POR_DEFECTO = 'Sevencars'

/** Campos del deal que deciden si una plantilla aplica. */
export interface DealParaPlantilla {
  estado?: string | null
  restoAPagar?: number | string | null
  cambioNombreSolicitado?: boolean | null
  documentacionRecibida?: boolean | null
  clienteAvisado?: boolean | null
  documentacionRetirada?: boolean | null
}

/** Deal mínimo del que se puede derivar el contexto de una plantilla. */
export interface DealParaCtx extends DealParaPlantilla {
  cliente?: { nombre?: string | null; apellidos?: string | null } | null
  vehiculo?: {
    marca?: string | null
    modelo?: string | null
    matricula?: string | null
  } | null
  importeTotal?: number | string | null
  importeSena?: number | string | null
  fechaReservaExpira?: Date | string | null
}

export interface PlantillaCtx {
  nombreCliente: string
  /** 'Marca Modelo (matrícula)' */
  vehiculo: string
  importeTotal?: number | null
  importeSena?: number | null
  restoAPagar?: number | null
  /** Ya formateada (dd/mm/yyyy) o null. */
  fechaReservaExpira?: string | null
  empresa: string
  telefonoEmpresa?: string | null
}

export interface Plantilla {
  id: PlantillaId
  titulo: string
  cuandoAplica: (deal: DealParaPlantilla) => boolean
  asunto: (ctx: PlantillaCtx) => string
  texto: (ctx: PlantillaCtx) => string
}

// ---------- helpers ----------

function num(v: number | string | null | undefined): number | null {
  if (v === null || v === undefined || v === '') return null
  const n = typeof v === 'string' ? Number(v) : v
  return Number.isFinite(n) ? n : null
}

/**
 * Formato español fijo (1.234,56 €) sin depender de los datos ICU del runtime:
 * la locale es-ES no agrupa los miles en cifras de 4 dígitos según versión.
 */
export function formatearEuros(
  v: number | string | null | undefined
): string | null {
  const n = num(v)
  if (n === null) return null
  const [entero, dec] = Math.abs(n).toFixed(2).split('.')
  const miles = entero.replace(/\B(?=(\d{3})+(?!\d))/g, '.')
  return `${n < 0 ? '-' : ''}${miles},${dec} €`
}

export function formatearFecha(
  v: Date | string | null | undefined
): string | null {
  if (!v) return null
  const d = v instanceof Date ? v : new Date(v)
  if (Number.isNaN(d.getTime())) return null
  return d.toLocaleDateString('es-ES', {
    timeZone: 'Europe/Madrid',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  })
}

function estadoDe(deal: DealParaPlantilla): string {
  return String(deal.estado ?? '')
    .toLowerCase()
    .trim()
}

function saludo(ctx: PlantillaCtx): string {
  const n = ctx.nombreCliente.trim()
  return n ? `Hola ${n},` : 'Hola,'
}

function despedida(ctx: PlantillaCtx): string {
  const contacto = ctx.telefonoEmpresa
    ? `Si tienes cualquier duda, escríbenos o llámanos al ${ctx.telefonoEmpresa}.`
    : 'Si tienes cualquier duda, escríbenos y te respondemos enseguida.'
  return `${contacto}\n\nUn saludo,\nEl equipo de ${ctx.empresa}`
}

// ---------- plantillas ----------

export const PLANTILLAS: Record<PlantillaId, Plantilla> = {
  reserva_confirmada: {
    id: 'reserva_confirmada',
    titulo: 'Reserva confirmada',
    cuandoAplica: (d) => estadoDe(d) === 'reservado',
    asunto: (c) => `Reserva confirmada de tu ${c.vehiculo} — ${c.empresa}`,
    texto: (c) => {
      const sena = formatearEuros(c.importeSena)
      const total = formatearEuros(c.importeTotal)
      const resto = formatearEuros(c.restoAPagar)
      const pago: string[] = []
      if (sena) pago.push(`Hemos recibido tu señal de ${sena}.`)
      if (total) pago.push(`El importe total de la operación es de ${total}.`)
      if (resto)
        pago.push(
          `Queda pendiente ${resto}, que abonarás al formalizar la venta.`
        )
      const partes = [
        saludo(c),
        `Te confirmamos que tu ${c.vehiculo} ya está reservado a tu nombre.`,
      ]
      if (pago.length) partes.push(pago.join(' '))
      partes.push(
        c.fechaReservaExpira
          ? `La reserva se mantiene hasta el ${c.fechaReservaExpira}. Si necesitas más tiempo para formalizar la compra, dínoslo y lo vemos.`
          : 'Si necesitas más tiempo para formalizar la compra, dínoslo y lo vemos.'
      )
      partes.push(despedida(c))
      return partes.join('\n\n')
    },
  },

  documentacion_cambio_nombre: {
    id: 'documentacion_cambio_nombre',
    titulo: 'Documentación para el cambio de nombre',
    cuandoAplica: (d) =>
      estadoDe(d) === 'facturado' && !d.documentacionRecibida,
    asunto: (c) => `Documentación para el cambio de nombre de tu ${c.vehiculo}`,
    texto: (c) =>
      [
        saludo(c),
        `Para tramitar el cambio de nombre de tu ${c.vehiculo} necesitamos que nos hagas llegar esta documentación:`,
        [
          '- DNI o NIE en vigor (anverso y reverso).',
          '- Permiso de circulación del vehículo, si ya lo tienes tú.',
          '- Ficha técnica (tarjeta ITV), si ya la tienes tú.',
          '- Justificante de domicilio actual, si no coincide con el del DNI.',
        ].join('\n'),
        'Puedes enviárnosla respondiendo a este mensaje o traerla en persona. En cuanto la tengamos, iniciamos el trámite y te avisamos cuando esté todo listo.',
        despedida(c),
      ].join('\n\n'),
  },

  coche_listo: {
    id: 'coche_listo',
    titulo: 'Coche y documentación listos para recoger',
    cuandoAplica: (d) =>
      estadoDe(d) === 'facturado' &&
      Boolean(d.documentacionRecibida) &&
      !d.documentacionRetirada,
    asunto: (c) => `Tu ${c.vehiculo} ya está listo para recoger`,
    texto: (c) =>
      [
        saludo(c),
        `Buenas noticias: tu ${c.vehiculo} y toda su documentación ya están listos para que pases a recogerlos.`,
        'Puedes venir a {direccion} en nuestro horario habitual. Si lo prefieres, dinos qué día y hora te viene mejor y lo dejamos todo preparado para que no tengas que esperar.',
        'Recuerda traer tu DNI para la entrega.',
        despedida(c),
      ].join('\n\n'),
  },

  recordatorio_pago: {
    id: 'recordatorio_pago',
    titulo: 'Recordatorio de pago pendiente',
    cuandoAplica: (d) =>
      ['vendido', 'facturado'].includes(estadoDe(d)) &&
      (num(d.restoAPagar) ?? 0) > 0,
    asunto: (c) => `Importe pendiente de tu ${c.vehiculo}`,
    texto: (c) => {
      const resto = formatearEuros(c.restoAPagar)
      const total = formatearEuros(c.importeTotal)
      const pendiente = resto
        ? `queda pendiente ${resto}`
        : 'queda un importe pendiente'
      const delTotal = total ? ` del total de ${total}` : ''
      return [
        saludo(c),
        `Te escribimos para recordarte que ${pendiente}${delTotal} de tu ${c.vehiculo}.`,
        'Puedes hacer el pago por transferencia bancaria (si necesitas el número de cuenta, pídenoslo y te lo enviamos), con tarjeta en nuestras oficinas o a través de la financiación acordada.',
        'Si ya lo has abonado, no hagas caso de este mensaje. Y si te viene mejor otra forma de pago, cuéntanoslo y lo organizamos.',
        despedida(c),
      ].join('\n\n')
    },
  },
}

export function esPlantillaId(v: unknown): v is PlantillaId {
  return typeof v === 'string' && (PLANTILLA_IDS as string[]).includes(v)
}

export function plantillasQueAplican(deal: DealParaPlantilla): Plantilla[] {
  return PLANTILLA_IDS.map((id) => PLANTILLAS[id]).filter((p) =>
    p.cuandoAplica(deal)
  )
}

// ---------- render ----------

export function describirVehiculo(
  v: DealParaCtx['vehiculo'] | undefined
): string {
  const nombre = [v?.marca, v?.modelo]
    .map((s) => (s ?? '').trim())
    .filter(Boolean)
    .join(' ')
  const matricula = (v?.matricula ?? '').trim()
  if (!nombre) return matricula ? `vehículo (${matricula})` : 'vehículo'
  return matricula ? `${nombre} (${matricula})` : nombre
}

export function ctxDesdeDeal(
  deal: DealParaCtx,
  opts: { empresa?: string; telefonoEmpresa?: string | null } = {}
): PlantillaCtx {
  return {
    nombreCliente: (deal.cliente?.nombre ?? '').trim(),
    vehiculo: describirVehiculo(deal.vehiculo),
    importeTotal: num(deal.importeTotal),
    importeSena: num(deal.importeSena),
    restoAPagar: num(deal.restoAPagar),
    fechaReservaExpira: formatearFecha(deal.fechaReservaExpira),
    empresa: opts.empresa ?? EMPRESA_POR_DEFECTO,
    telefonoEmpresa: opts.telefonoEmpresa ?? null,
  }
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

/** Texto plano → párrafos simples (línea en blanco = nuevo <p>). */
export function textoAHtml(texto: string): string {
  const parrafos = texto
    .replace(/\r\n/g, '\n')
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => `<p>${escapeHtml(p).replace(/\n/g, '<br/>')}</p>`)
  return (
    '<div style="font-family:Arial,Helvetica,sans-serif;color:#1e293b;max-width:560px;line-height:1.5">\n' +
    parrafos.join('\n') +
    '\n</div>'
  )
}

export function renderPlantilla(
  id: PlantillaId,
  ctx: PlantillaCtx
): { asunto: string; texto: string; html: string } {
  const p = PLANTILLAS[id]
  if (!p) throw new Error(`Plantilla desconocida: ${id}`)
  const asunto = p.asunto(ctx)
  const texto = p.texto(ctx)
  return { asunto, texto, html: textoAHtml(texto) }
}

// ---------- WhatsApp ----------

/**
 * Normaliza a E.164 sin '+'. Español nacional (9 dígitos que empiezan por
 * 6/7/8/9) → prefijo 34; con +34/34/0034 se respeta; otros países solo si
 * llegan con prefijo explícito (+ o 00). Inválido → null.
 */
export function normalizarTelefono(
  telefono: string | null | undefined
): string | null {
  if (!telefono) return null
  let s = String(telefono).replace(/[\s().-]/g, '')
  if (!s) return null
  let internacional = false
  if (s.startsWith('+')) {
    internacional = true
    s = s.slice(1)
  } else if (s.startsWith('00')) {
    internacional = true
    s = s.slice(2)
  }
  if (!/^\d+$/.test(s)) return null
  if (/^[6789]\d{8}$/.test(s)) return `34${s}`
  if (s.startsWith('34')) return /^34[6789]\d{8}$/.test(s) ? s : null
  if (internacional && s.length >= 8 && s.length <= 15 && !s.startsWith('0'))
    return s
  return null
}

export function enlaceWhatsApp(
  telefono: string | null | undefined,
  texto: string
): string | null {
  const n = normalizarTelefono(telefono)
  if (!n) return null
  return `https://wa.me/${n}?text=${encodeURIComponent(texto)}`
}

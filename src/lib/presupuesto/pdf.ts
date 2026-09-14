/**
 * PDF del presupuesto premium (A4, 1 hoja) con jsPDF en servidor: logo, ficha
 * del vehículo con foto, dos columnas (sin/con garantía premium), cuotas,
 * QR a la página pública y texto legal. Renderiza desde el ResultadoCalculo
 * guardado; foto y QR se cargan aquí (o se inyectan por `opts`).
 */
import { INVOICE_CONFIG } from '@/config/invoiceConfig'
import jsPDF from '@/lib/jspdf-server'
import { LOGO_CONTRATO_BASE64 } from '@/lib/logoBase64'
import { COLORS, drawAccentBar, drawFooter, formatEUR } from '@/lib/pdf/theme'
import { qrPngDataUrl } from '@/lib/qr'
import type { FichaComercial } from '@/lib/fichaComercial'
import type { VehiculoPresupuesto } from './servicio'
import type {
  ChequeoPresupuesto,
  ColumnaCalculo,
  ParametrosPresupuesto,
  ResultadoCalculo,
} from './tipos'

export interface DatosPdfPresupuesto {
  numero: string
  /** 'YYYY-MM-DD' */
  fecha: string
  /** 'YYYY-MM-DD' */
  validoHasta: string
  nombreCliente: string
  vehiculo: VehiculoPresupuesto
  ficha: FichaComercial | null
  calculo: ResultadoCalculo
  urlPublica: string
  params: ParametrosPresupuesto
}

type RGB = [number, number, number]
type Doc = InstanceType<typeof jsPDF>

const PAGE_W = 210
const PAGE_H = 297
const MARGIN = 14
const CONTENT_W = PAGE_W - MARGIN * 2
const GAP_COL = 6
const COL_W = (CONTENT_W - GAP_COL) / 2
const FOOTER_Y = PAGE_H - 15
const QR_MM = 24
/** Aviso interno de la hoja: no se imprime al cliente. */
const AVISOS_INTERNOS = new Set(['FINANCIA MÁS 70%'])

const fill = (doc: Doc, c: RGB) => doc.setFillColor(c[0], c[1], c[2])
const stroke = (doc: Doc, c: RGB) => doc.setDrawColor(c[0], c[1], c[2])
const color = (doc: Doc, c: RGB) => doc.setTextColor(c[0], c[1], c[2])
const font = (doc: Doc, size: number, bold = false) => {
  doc.setFontSize(size)
  doc.setFont('helvetica', bold ? 'bold' : 'normal')
}

function fechaEs(ymd: string | null | undefined): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(ymd ?? '')
  return m ? `${m[3]}/${m[2]}/${m[1]}` : '—'
}

const euros0 = new Intl.NumberFormat('es-ES', {
  style: 'currency',
  currency: 'EUR',
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
})

/**
 * La ficha guarda mantenimientos como plantilla libre (">> ITV", ">> ACEITE …
 * meses - … km"). Solo se imprimen las líneas con datos reales (algún dígito).
 */
function lineasMantenimientos(raw: string | null | undefined): string {
  return String(raw ?? '')
    .split(/\r?\n/)
    .map((l) => l.replace(/^[\s>&*-]+/, '').trim())
    .filter((l) => /\d/.test(l))
    .join(' · ')
}

function kmsTexto(kms: number | null): string | null {
  if (kms == null) return null
  return `${new Intl.NumberFormat('es-ES').format(kms)} km`
}

// ── Recursos externos ───────────────────────────────────────────────────────

/** Foto de la ficha → JPEG (sharp) como data URL. Cualquier fallo → null. */
export async function cargarImagenJpegDataUrl(
  url: string | null | undefined,
  timeoutMs = 4000
): Promise<string | null> {
  if (!url || !/^https?:\/\//i.test(url)) return null
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), timeoutMs)
  try {
    const res = await fetch(url, { signal: ctrl.signal })
    if (!res.ok) return null
    const buf = Buffer.from(await res.arrayBuffer())
    const sharp = (await import('sharp')).default
    const jpeg = await sharp(buf)
      .rotate()
      .resize({ width: 900, withoutEnlargement: true })
      .jpeg({ quality: 80 })
      .toBuffer()
    return `data:image/jpeg;base64,${jpeg.toString('base64')}`
  } catch (e) {
    console.warn('[presupuesto pdf] foto no disponible:', (e as Error).message)
    return null
  } finally {
    clearTimeout(timer)
  }
}

export async function generarQrDataUrl(url: string): Promise<string | null> {
  try {
    return await qrPngDataUrl(url, 300)
  } catch (e) {
    console.warn('[presupuesto pdf] QR no generado:', (e as Error).message)
    return null
  }
}

// ── Bloques ─────────────────────────────────────────────────────────────────

function drawCabecera(doc: Doc, d: DatosPdfPresupuesto): number {
  const top = 10
  try {
    doc.addImage(LOGO_CONTRATO_BASE64, 'PNG', MARGIN, top, 50, 20)
  } catch (e) {
    console.warn('[presupuesto pdf] logo no añadido:', (e as Error).message)
  }

  const pillW = 78
  const pillH = 20
  const pillX = PAGE_W - MARGIN - pillW
  const pillY = top
  fill(doc, COLORS.bgSoft)
  doc.roundedRect(pillX, pillY, pillW, pillH, 1.5, 1.5, 'F')

  font(doc, 11, true)
  color(doc, COLORS.brandDark)
  doc.text('PRESUPUESTO', pillX + 3, pillY + 6)
  const filas: Array<[string, string]> = [
    ['Nº', d.numero],
    ['Fecha', fechaEs(d.fecha)],
    ['Válido hasta', fechaEs(d.validoHasta)],
  ]
  filas.forEach(([k, v], i) => {
    const y = pillY + 10.5 + i * 3.6
    font(doc, 7, false)
    color(doc, COLORS.textSecondary)
    doc.text(k, pillX + 3, y)
    font(doc, 7.5, true)
    color(doc, COLORS.textPrimary)
    doc.text(v, pillX + pillW - 3, y, { align: 'right' })
  })

  drawAccentBar(doc, MARGIN, top + 24, CONTENT_W)
  return top + 29
}

function drawVehiculo(
  doc: Doc,
  d: DatosPdfPresupuesto,
  foto: string | null,
  y: number
): number {
  const { vehiculo: v, ficha: f, calculo } = d
  const fotoW = 56
  const fotoH = 38
  const pad = 4
  const x = MARGIN + pad + 1.4 + (foto ? fotoW + pad : 0)
  const textW = MARGIN + CONTENT_W - pad - x

  // Contenido de texto primero: la altura de la card depende de él (sin foto
  // no se reserva el hueco de la imagen).
  const nombre =
    (f?.nombre_comercial ?? '').trim() ||
    [v.marca, v.modelo].filter(Boolean).join(' ') ||
    'Vehículo'
  font(doc, 12.5, true)
  const nombreLineas: string[] = doc.splitTextToSize(nombre, textW).slice(0, 2)
  const linea1 = [
    v.matricula ? `Matrícula ${v.matricula}` : null,
    v.fechaMatriculacion
      ? `Matriculación ${fechaEs(v.fechaMatriculacion)}`
      : v.anio
        ? `Año ${v.anio}`
        : null,
    kmsTexto(v.kms),
    v.color,
  ].filter(Boolean)
  const linea2 = [
    f?.combustible,
    f?.caja,
    f?.motor_cv ? `${f.motor_cv} CV` : null,
    f?.cubicaje ? `${f.cubicaje} cc` : null,
  ].filter(Boolean)

  const infoLineas = [linea1, linea2]
    .filter((l) => l.length)
    .map((l) => l.join('  ·  '))
  font(doc, 7.5, false)
  const mantLineas: string[] = doc
    .splitTextToSize(lineasMantenimientos(f?.mantenimientos), textW)
    .filter(Boolean)
    .slice(0, 2)
  const oficial = calculo.derivados.garantia.textoOficial

  const textH =
    5 +
    nombreLineas.length * 5.2 +
    infoLineas.length * 4.2 +
    mantLineas.length * 3.6 +
    (oficial ? 4.5 : 0)
  const cardH = Math.max(foto ? fotoH + pad * 2 : 0, textH + pad + 1)

  fill(doc, COLORS.bgCard)
  stroke(doc, COLORS.border)
  doc.setLineWidth(0.2)
  doc.roundedRect(MARGIN, y, CONTENT_W, cardH, 1.5, 1.5, 'FD')
  fill(doc, COLORS.brandDark)
  doc.rect(MARGIN, y, 1.4, cardH, 'F')
  if (foto) {
    try {
      doc.addImage(foto, 'JPEG', MARGIN + pad + 1.4, y + pad, fotoW, fotoH)
    } catch (e) {
      console.warn('[presupuesto pdf] foto no añadida:', (e as Error).message)
    }
  }

  let ty = y + pad + 5
  font(doc, 12.5, true)
  color(doc, COLORS.textPrimary)
  for (const l of nombreLineas) {
    doc.text(l, x, ty)
    ty += 5.2
  }
  font(doc, 8.2, false)
  color(doc, COLORS.textSecondary)
  ty += 0.3
  for (const l of infoLineas) {
    doc.text(l, x, ty, { maxWidth: textW })
    ty += 4.2
  }
  font(doc, 7.5, false)
  for (const l of mantLineas) {
    doc.text(l, x, ty)
    ty += 3.6
  }
  if (oficial) {
    font(doc, 8, true)
    color(doc, COLORS.brandDark)
    doc.text(oficial, x, ty + 0.8)
  }

  color(doc, COLORS.textPrimary)
  return y + cardH + 5
}

function drawCliente(doc: Doc, d: DatosPdfPresupuesto, y: number): number {
  font(doc, 9, false)
  color(doc, COLORS.textSecondary)
  doc.text('Presupuesto para', MARGIN, y)
  font(doc, 8.5, true)
  color(doc, COLORS.brandDark)
  const validez = d.calculo.textos.validez
  doc.text(validez, PAGE_W - MARGIN, y, { align: 'right' })
  const validezW = doc.getTextWidth(validez)

  // El nombre se recorta a una línea para no pisar el texto de validez.
  font(doc, 10.5, true)
  color(doc, COLORS.textPrimary)
  const nombreW = CONTENT_W - 30 - validezW - 6
  const [nombre] = doc.splitTextToSize(d.nombreCliente || '—', nombreW)
  doc.text(nombre, MARGIN + 30, y)
  color(doc, COLORS.textPrimary)
  return y + 6
}

interface AlturaColumna {
  lineasFin: number
}

/** Cabecera + líneas de una columna; devuelve la y tras la última línea. */
function drawLineasColumna(
  doc: Doc,
  col: ColumnaCalculo,
  x: number,
  y: number
): AlturaColumna {
  const headH = 8
  fill(doc, COLORS.brandDark)
  doc.roundedRect(x, y, COL_W, headH, 1.2, 1.2, 'F')
  doc.rect(x, y + headH - 2, COL_W, 2, 'F')
  font(doc, 8.6, true)
  color(doc, COLORS.white)
  doc.text(col.titulo.toUpperCase(), x + COL_W / 2, y + 5.4, {
    align: 'center',
  })

  let cy = y + headH
  const rowH = 5.6
  const padX = 3
  for (const l of col.lineas.filter((l) => l.visible)) {
    const conSub = !!l.subtitulo
    const h = rowH + (conSub ? 3.2 : 0)
    if (l.tipo === 'subtotal') {
      fill(doc, COLORS.bgSoft)
      doc.rect(x, cy, COL_W, h, 'F')
    }
    if (l.tipo === 'total') {
      stroke(doc, COLORS.brandDark)
      doc.setLineWidth(0.4)
      doc.line(x, cy, x + COL_W, cy)
    }
    const bold = l.tipo !== 'linea'
    const size = l.tipo === 'total' ? 9.6 : 8.2
    font(doc, size, bold)
    color(doc, l.tipo === 'total' ? COLORS.brandDark : COLORS.textPrimary)
    const baseY = cy + 3.9
    doc.text(l.etiqueta, x + padX, baseY, { maxWidth: COL_W - 32 })
    if (!l.sinImporte) {
      doc.text(formatEUR(l.importe), x + COL_W - padX, baseY, {
        align: 'right',
      })
    }
    if (conSub) {
      font(doc, 6.8, false)
      color(doc, COLORS.textSecondary)
      doc.text(l.subtitulo as string, x + padX, baseY + 3.2)
    }
    cy += h
  }
  stroke(doc, COLORS.border)
  doc.setLineWidth(0.2)
  doc.line(x, cy, x + COL_W, cy)
  color(doc, COLORS.textPrimary)
  return { lineasFin: cy }
}

function drawCuotasColumna(
  doc: Doc,
  col: ColumnaCalculo,
  x: number,
  y: number
): number {
  const padX = 3
  const conCuota = col.cuotas.filter((c) => c.cuota !== null)
  if (!conCuota.length) return y

  let cy = y + 4
  font(doc, 7, true)
  color(doc, COLORS.textSecondary)
  doc.text('CUOTA MENSUAL ORIENTATIVA', x + padX, cy)
  cy += 1.6

  const rowH = 4.6
  for (const c of col.cuotas) {
    cy += rowH
    font(doc, 8, false)
    color(doc, COLORS.textSecondary)
    doc.text(`${c.plazo} meses`, x + padX, cy)
    font(doc, 8.4, c.cuota !== null)
    color(doc, c.cuota !== null ? COLORS.textPrimary : COLORS.textMuted)
    doc.text(
      c.cuota === null ? '—' : `${euros0.format(c.cuota)}/mes`,
      x + COL_W - padX,
      cy,
      { align: 'right' }
    )
  }

  if (col.desde !== null) {
    cy += 3
    fill(doc, COLORS.bgSoft)
    doc.roundedRect(x, cy, COL_W, 8.4, 1.2, 1.2, 'F')
    font(doc, 8, false)
    color(doc, COLORS.textSecondary)
    doc.text('Desde', x + padX, cy + 5.6)
    font(doc, 11.5, true)
    color(doc, COLORS.brandDark)
    doc.text(`${euros0.format(col.desde)}/mes`, x + COL_W - padX, cy + 5.8, {
      align: 'right',
    })
    cy += 8.4
  }
  color(doc, COLORS.textPrimary)
  return cy
}

function drawCheck(doc: Doc, x: number, y: number, ok: boolean) {
  if (ok) {
    stroke(doc, COLORS.brandDark)
    doc.setLineWidth(0.5)
    doc.line(x, y - 1.2, x + 1.1, y)
    doc.line(x + 1.1, y, x + 3, y - 2.6)
  } else {
    font(doc, 9, true)
    color(doc, COLORS.textMuted)
    doc.text('×', x + 0.4, y + 0.6)
  }
}

function drawChecksColumna(
  doc: Doc,
  checks: ChequeoPresupuesto[],
  x: number,
  y: number
): number {
  let cy = y + 3
  for (const c of checks) {
    cy += 4.4
    drawCheck(doc, x + 3, cy, c.ok)
    font(doc, 7.8, false)
    color(doc, c.ok ? COLORS.textPrimary : COLORS.textSecondary)
    doc.text(c.texto, x + 8, cy, { maxWidth: COL_W - 10 })
  }
  color(doc, COLORS.textPrimary)
  return cy
}

function drawColumnas(doc: Doc, calc: ResultadoCalculo, y: number): number {
  const xs: Record<'sin_premium' | 'premium', number> = {
    sin_premium: MARGIN,
    premium: MARGIN + COL_W + GAP_COL,
  }
  const cols = [calc.columnas.sin_premium, calc.columnas.premium]
  const fin = cols.map((c) => drawLineasColumna(doc, c, xs[c.clave], y))
  let yCuotas = Math.max(...fin.map((f) => f.lineasFin))
  let yChecks = yCuotas
  if (calc.financiable) {
    const fines = cols.map((c) =>
      drawCuotasColumna(doc, c, xs[c.clave], yCuotas)
    )
    yChecks = Math.max(...fines)
  }
  const finChecks = cols.map((c) =>
    drawChecksColumna(doc, calc.checks[c.clave], xs[c.clave], yChecks)
  )
  yCuotas = Math.max(...finChecks)
  return yCuotas + 4
}

function drawAvisos(doc: Doc, calc: ResultadoCalculo, y: number): number {
  const avisos = calc.avisos.filter((a) => !AVISOS_INTERNOS.has(a))
  if (!avisos.length) return y
  font(doc, 7, false)
  color(doc, COLORS.danger)
  for (const a of avisos) {
    doc.text(a, MARGIN, y)
    y += 3.6
  }
  color(doc, COLORS.textPrimary)
  return y + 1
}

function drawLegalYQr(
  doc: Doc,
  d: DatosPdfPresupuesto,
  qr: string | null,
  yMin: number
) {
  const blockH = QR_MM + 4
  const y = Math.max(yMin, FOOTER_Y - 4 - blockH)
  const qrX = PAGE_W - MARGIN - QR_MM
  if (qr) {
    try {
      doc.addImage(qr, 'PNG', qrX, y, QR_MM, QR_MM)
      font(doc, 6, false)
      color(doc, COLORS.textSecondary)
      doc.text('Escanea para verlo online', qrX + QR_MM / 2, y + QR_MM + 2.6, {
        align: 'center',
      })
    } catch (e) {
      console.warn('[presupuesto pdf] QR no añadido:', (e as Error).message)
    }
  }
  const textW = qrX - MARGIN - 6
  font(doc, 6.5, false)
  color(doc, COLORS.textSecondary)
  const lineas = doc.splitTextToSize(d.calculo.textos.legal, textW)
  let ty = y + 2.5
  lineas.forEach((l: string) => {
    doc.text(l, MARGIN, ty)
    ty += 2.9
  })
  ty += 1.2
  font(doc, 6.5, true)
  color(doc, COLORS.brandDark)
  doc.text(`Tu presupuesto online: ${d.urlPublica}`, MARGIN, ty, {
    maxWidth: textW,
  })
  color(doc, COLORS.textPrimary)
}

// ── Documento ───────────────────────────────────────────────────────────────

export async function generarPresupuestoPdf(
  d: DatosPdfPresupuesto,
  opts: { foto?: string | null; qr?: string | null } = {}
): Promise<Uint8Array> {
  const [foto, qr] = await Promise.all([
    opts.foto !== undefined
      ? opts.foto
      : cargarImagenJpegDataUrl(d.ficha?.url_imagen),
    opts.qr !== undefined ? opts.qr : generarQrDataUrl(d.urlPublica),
  ])

  const doc = new jsPDF({ unit: 'mm', format: 'a4' })
  let y = drawCabecera(doc, d)
  y = drawVehiculo(doc, d, foto, y)
  y = drawCliente(doc, d, y)
  y = drawColumnas(doc, d.calculo, y)
  y = drawAvisos(doc, d.calculo, y)
  drawLegalYQr(doc, d, qr, y)
  drawFooter(
    doc,
    {
      legalName: INVOICE_CONFIG.vendor.legalName,
      cif: INVOICE_CONFIG.vendor.cif,
    },
    PAGE_W,
    PAGE_H,
    MARGIN
  )
  return new Uint8Array(doc.output('arraybuffer'))
}

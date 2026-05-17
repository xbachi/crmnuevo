/**
 * Tema visual para PDFs de SevenCars (factura).
 *
 * Inspirado en el stack de Wheel Lab: paleta corporativa + helpers
 * reutilizables (cabecera, cards, tabla de ítems, caja de totales,
 * footer). Pensado para jsPDF únicamente — no introduce dependencias
 * nuevas.
 *
 * Solo se usa en facturas. Los contratos largos (reserva/venta) siguen
 * con su layout actual porque tienen mucho texto y otro flow.
 */

import type { jsPDF } from 'jspdf'

// -----------------------------------------------------------------------------
// Paleta SevenCars (verde corporativo)
// -----------------------------------------------------------------------------
export const COLORS = {
  brandDark: [4, 120, 87] as [number, number, number], // #047857 emerald-700
  brandLight: [16, 185, 129] as [number, number, number], // #10b981 emerald-500
  textPrimary: [17, 24, 39] as [number, number, number], // gray-900
  textSecondary: [75, 85, 99] as [number, number, number], // gray-600
  textMuted: [156, 163, 175] as [number, number, number], // gray-400
  bgSoft: [243, 244, 246] as [number, number, number], // gray-100
  bgCard: [249, 250, 251] as [number, number, number], // gray-50
  border: [229, 231, 235] as [number, number, number], // gray-200
  white: [255, 255, 255] as [number, number, number],
}

// -----------------------------------------------------------------------------
// Formato monetario (idéntico al resto del CRM)
// -----------------------------------------------------------------------------
export function formatEUR(value: number): string {
  return new Intl.NumberFormat('es-ES', {
    style: 'currency',
    currency: 'EUR',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value || 0)
}

// -----------------------------------------------------------------------------
// Helpers de bajo nivel
// -----------------------------------------------------------------------------
function rgb(doc: jsPDF, c: [number, number, number]) {
  doc.setFillColor(c[0], c[1], c[2])
}
function strokeRgb(doc: jsPDF, c: [number, number, number]) {
  doc.setDrawColor(c[0], c[1], c[2])
}
function textRgb(doc: jsPDF, c: [number, number, number]) {
  doc.setTextColor(c[0], c[1], c[2])
}

/**
 * Barra de cabecera fina con acento de color de marca. Va justo debajo
 * del bloque del logo + vendor.
 */
export function drawAccentBar(
  doc: jsPDF,
  x: number,
  y: number,
  width: number
) {
  rgb(doc, COLORS.brandDark)
  doc.rect(x, y, width, 1.2, 'F')
  rgb(doc, COLORS.brandLight)
  doc.rect(x, y, width * 0.35, 1.2, 'F')
}

/**
 * Bloque del emisor (datos de Seven Cars Motors). Centrado.
 * Devuelve la nueva yPosition después del bloque.
 */
export function drawVendorBlock(
  doc: jsPDF,
  vendor: {
    legalName: string
    cif: string
    address: string
    city: string
    postalCode: string
    province: string
    phone: string
    email: string
  },
  pageWidth: number,
  y: number
): number {
  // Tipografía 2pt más chica y líneas más juntas — el bloque debe sentirse
  // como un sub-header del logo, no como un párrafo aparte.
  const cx = pageWidth / 2
  doc.setFontSize(8)
  doc.setFont('helvetica', 'bold')
  textRgb(doc, COLORS.textPrimary)
  doc.text(vendor.legalName, cx, y, { align: 'center' })

  doc.setFont('helvetica', 'normal')
  textRgb(doc, COLORS.textSecondary)
  doc.setFontSize(7)

  const linea1 = `CIF: ${vendor.cif}  ·  ${vendor.address}`
  const linea2 = `${vendor.postalCode} ${vendor.city}, ${vendor.province}`
  const linea3 = [vendor.phone, vendor.email].filter(Boolean).join('  ·  ')

  doc.text(linea1, cx, y + 3.3, { align: 'center' })
  doc.text(linea2, cx, y + 6.3, { align: 'center' })
  if (linea3) doc.text(linea3, cx, y + 9.3, { align: 'center' })

  return y + 12
}

/**
 * Título "FACTURA" con número + fecha a la derecha en un pill.
 */
export function drawInvoiceTitleBar(
  doc: jsPDF,
  title: string,
  invoiceNumber: string,
  invoiceDate: string,
  x: number,
  y: number,
  width: number
): number {
  // Título grande izquierda
  doc.setFontSize(20)
  doc.setFont('helvetica', 'bold')
  textRgb(doc, COLORS.brandDark)
  doc.text(title, x, y + 7)

  // Pill derecha con número y fecha
  const pillW = 75
  const pillH = 14
  const pillX = x + width - pillW
  const pillY = y - 2
  rgb(doc, COLORS.bgSoft)
  doc.roundedRect(pillX, pillY, pillW, pillH, 1.5, 1.5, 'F')

  doc.setFontSize(7.5)
  doc.setFont('helvetica', 'normal')
  textRgb(doc, COLORS.textSecondary)
  doc.text('Nº', pillX + 3, pillY + 5)
  doc.text('Fecha', pillX + 3, pillY + 10)

  doc.setFont('helvetica', 'bold')
  textRgb(doc, COLORS.textPrimary)
  doc.text(invoiceNumber, pillX + pillW - 3, pillY + 5, { align: 'right' })
  doc.text(invoiceDate, pillX + pillW - 3, pillY + 10, { align: 'right' })

  textRgb(doc, COLORS.textPrimary)
  return y + 15
}

/**
 * Card del cliente (FACTURAR A) con fondo gris suave y borde.
 */
export function drawClientCard(
  doc: jsPDF,
  client: {
    name: string
    dni: string
    address: string
    phone: string
    email: string
  },
  x: number,
  y: number,
  width: number
): number {
  doc.setFontSize(7.5)
  doc.setFont('helvetica', 'bold')
  textRgb(doc, COLORS.textSecondary)
  doc.text('FACTURAR A', x, y)
  y += 3

  const cardH = 24
  rgb(doc, COLORS.bgCard)
  strokeRgb(doc, COLORS.border)
  doc.setLineWidth(0.2)
  doc.roundedRect(x, y, width, cardH, 1.5, 1.5, 'FD')

  // Nombre destacado
  doc.setFontSize(10.5)
  doc.setFont('helvetica', 'bold')
  textRgb(doc, COLORS.textPrimary)
  doc.text(client.name, x + 4, y + 6)

  // Detalles
  doc.setFontSize(8)
  doc.setFont('helvetica', 'normal')
  textRgb(doc, COLORS.textSecondary)
  doc.text(`DNI/NIE: ${client.dni}`, x + 4, y + 11)
  if (client.address) doc.text(client.address, x + 4, y + 15)
  const contact = [client.phone, client.email].filter(Boolean).join('  ·  ')
  if (contact) doc.text(contact, x + 4, y + 19.5)

  textRgb(doc, COLORS.textPrimary)
  return y + cardH + 4
}

/**
 * Tabla de ítems con header coloreado + filas alternadas. En facturas
 * de vehículos la tabla normalmente tiene una sola fila (la venta),
 * pero el diseño soporta múltiples.
 */
export interface InvoiceItemRow {
  description: string
  /** Líneas adicionales descriptivas (matrícula, bastidor, etc.) */
  details?: string[]
  unitPrice: number
  total: number
}

export function drawItemsTable(
  doc: jsPDF,
  items: InvoiceItemRow[],
  x: number,
  y: number,
  width: number
): number {
  const colDesc = x + 3
  const colUnitPrice = x + width - 65
  const colTotal = x + width - 6
  const headerH = 8

  // Header
  rgb(doc, COLORS.brandDark)
  doc.rect(x, y, width, headerH, 'F')
  doc.setFontSize(8)
  doc.setFont('helvetica', 'bold')
  textRgb(doc, COLORS.white)
  doc.text('DESCRIPCIÓN', colDesc, y + 5.5)
  doc.text('P. UNITARIO', colUnitPrice, y + 5.5, { align: 'right' })
  doc.text('TOTAL', colTotal, y + 5.5, { align: 'right' })

  y += headerH

  // Filas
  textRgb(doc, COLORS.textPrimary)
  items.forEach((item, idx) => {
    const detailLines = item.details ?? []
    const rowH = 7 + detailLines.length * 4 + 2

    if (idx % 2 === 1) {
      rgb(doc, COLORS.bgCard)
      doc.rect(x, y, width, rowH, 'F')
    }

    doc.setFontSize(9)
    doc.setFont('helvetica', 'bold')
    textRgb(doc, COLORS.textPrimary)
    doc.text(item.description, colDesc, y + 5, {
      maxWidth: colUnitPrice - colDesc - 5,
    })

    doc.setFontSize(8)
    doc.setFont('helvetica', 'normal')
    textRgb(doc, COLORS.textSecondary)
    detailLines.forEach((line, li) => {
      doc.text(line, colDesc, y + 9 + li * 4)
    })

    doc.setFontSize(9)
    doc.setFont('helvetica', 'normal')
    textRgb(doc, COLORS.textPrimary)
    doc.text(formatEUR(item.unitPrice), colUnitPrice, y + 5, { align: 'right' })
    doc.setFont('helvetica', 'bold')
    doc.text(formatEUR(item.total), colTotal, y + 5, { align: 'right' })

    y += rowH
  })

  // Borde inferior
  strokeRgb(doc, COLORS.border)
  doc.setLineWidth(0.2)
  doc.line(x, y, x + width, y)

  textRgb(doc, COLORS.textPrimary)
  return y + 4
}

/**
 * Caja de totales alineada a la derecha, con el TOTAL final destacado.
 */
export function drawTotalsBox(
  doc: jsPDF,
  totals: {
    subtotal?: number
    taxLabel?: string
    taxAmount?: number
    total: number
  },
  pageWidth: number,
  margin: number,
  y: number
): number {
  const boxW = 75
  const boxX = pageWidth - margin - boxW
  const hasBreakdown =
    totals.subtotal != null && totals.taxAmount != null && totals.taxLabel
  const boxH = hasBreakdown ? 22 : 12

  rgb(doc, COLORS.bgCard)
  strokeRgb(doc, COLORS.border)
  doc.setLineWidth(0.2)
  doc.roundedRect(boxX, y, boxW, boxH, 1.5, 1.5, 'FD')

  doc.setFontSize(8)
  doc.setFont('helvetica', 'normal')
  textRgb(doc, COLORS.textSecondary)

  if (hasBreakdown) {
    doc.text('Subtotal', boxX + 3, y + 5)
    doc.text(formatEUR(totals.subtotal!), boxX + boxW - 3, y + 5, {
      align: 'right',
    })
    doc.text(totals.taxLabel!, boxX + 3, y + 10)
    doc.text(formatEUR(totals.taxAmount!), boxX + boxW - 3, y + 10, {
      align: 'right',
    })

    // Separador
    strokeRgb(doc, COLORS.border)
    doc.line(boxX + 3, y + 13, boxX + boxW - 3, y + 13)

    doc.setFontSize(11)
    doc.setFont('helvetica', 'bold')
    textRgb(doc, COLORS.brandDark)
    doc.text('TOTAL', boxX + 3, y + 18.5)
    doc.text(formatEUR(totals.total), boxX + boxW - 3, y + 18.5, {
      align: 'right',
    })
  } else {
    doc.setFontSize(11)
    doc.setFont('helvetica', 'bold')
    textRgb(doc, COLORS.brandDark)
    doc.text('TOTAL', boxX + 3, y + 8)
    doc.text(formatEUR(totals.total), boxX + boxW - 3, y + 8, {
      align: 'right',
    })
  }

  textRgb(doc, COLORS.textPrimary)
  return y + boxH + 4
}

// =============================================================================
// Helpers extra para CONTRATOS (reserva, venta) — pensados para entrar todo
// en 1 hoja A4. Tipografía más chica + líneas más juntas que la factura.
// =============================================================================

/**
 * Título de sección (REUNIDOS, EXPONEN, etc.) con barra de color a la izquierda.
 */
export function drawSectionTitle(
  doc: jsPDF,
  label: string,
  x: number,
  y: number
): number {
  // Barrita más alta para mejor presencia visual y centrada con la línea base
  // del título. El título se desplaza 5mm a la derecha para dejar aire.
  const barH = 5.5
  rgb(doc, COLORS.brandDark)
  doc.rect(x, y - barH + 1, 1.6, barH, 'F')
  doc.setFontSize(10)
  doc.setFont('helvetica', 'bold')
  textRgb(doc, COLORS.brandDark)
  doc.text(label.toUpperCase(), x + 5, y + 1)
  textRgb(doc, COLORS.textPrimary)
  return y + 7
}

/**
 * Card compacta para parte vendedora/compradora del contrato. Hace
 * splitTextToSize internamente. Devuelve la nueva yPosition.
 */
export function drawPartyCard(
  doc: jsPDF,
  label: string,
  paragraph: string,
  x: number,
  y: number,
  width: number
): number {
  const lineHeight = 4
  const padX = 4
  const padY = 3.5
  doc.setFontSize(9)
  doc.setFont('helvetica', 'normal')
  const lines = doc.splitTextToSize(paragraph, width - padX * 2)
  const cardH = padY * 2 + 4.5 + lines.length * lineHeight

  rgb(doc, COLORS.bgCard)
  strokeRgb(doc, COLORS.border)
  doc.setLineWidth(0.2)
  doc.roundedRect(x, y, width, cardH, 1.5, 1.5, 'FD')

  doc.setFontSize(7.5)
  doc.setFont('helvetica', 'bold')
  textRgb(doc, COLORS.brandDark)
  doc.text(label.toUpperCase(), x + padX, y + padY + 1.5)

  doc.setFontSize(9)
  doc.setFont('helvetica', 'normal')
  textRgb(doc, COLORS.textPrimary)
  lines.forEach((line: string, i: number) => {
    doc.text(line, x + padX, y + padY + 5.5 + i * lineHeight)
  })

  return y + cardH + 3
}

/**
 * Tabla compacta de datos del vehículo en 2 columnas (3 filas).
 * Diseñada para 1 hoja: ocupa ~16mm de alto.
 */
export function drawVehicleDataCard(
  doc: jsPDF,
  v: {
    marca?: string
    modelo?: string
    matricula?: string
    bastidor?: string
    kms?: string
    fechaMatriculacion?: string
  },
  x: number,
  y: number,
  width: number
): number {
  // Card con borde-acento verde a la izquierda + padding generoso adentro.
  const cardH = 24
  const accentW = 1.6
  // Fondo + borde fino
  rgb(doc, COLORS.bgCard)
  strokeRgb(doc, COLORS.border)
  doc.setLineWidth(0.2)
  doc.roundedRect(x, y, width, cardH, 1.5, 1.5, 'FD')
  // Acento de marca en el lado izquierdo
  rgb(doc, COLORS.brandDark)
  doc.rect(x, y, accentW, cardH, 'F')

  const innerX = x + 6 + accentW
  const colW = (width - innerX + x) / 2
  const labelX = innerX
  const valueX = innerX + 26
  const labelX2 = innerX + colW
  const valueX2 = innerX + colW + 26

  const drawRow = (
    rowY: number,
    l1: string,
    v1: string,
    l2: string,
    v2: string
  ) => {
    doc.setFontSize(7.5)
    doc.setFont('helvetica', 'normal')
    textRgb(doc, COLORS.textSecondary)
    doc.text(l1, labelX, rowY)
    doc.text(l2, labelX2, rowY)
    doc.setFontSize(8.8)
    doc.setFont('helvetica', 'bold')
    textRgb(doc, COLORS.textPrimary)
    doc.text(v1, valueX, rowY, { maxWidth: colW - 28 })
    doc.text(v2, valueX2, rowY, { maxWidth: colW - 28 })
  }

  drawRow(y + 6, 'MARCA', v.marca || '—', 'MATRÍCULA', v.matricula || '—')
  drawRow(y + 13, 'MODELO', v.modelo || '—', 'BASTIDOR', v.bastidor || '—')
  drawRow(
    y + 20,
    'F. MATR.',
    v.fechaMatriculacion || '—',
    'KMS',
    v.kms || '—'
  )

  textRgb(doc, COLORS.textPrimary)
  return y + cardH + 4
}

/**
 * Punto numerado del contrato con texto justificado. Reduce padding para
 * que entre todo en 1 hoja.
 */
export function drawNumberedPoint(
  doc: jsPDF,
  num: number,
  text: string,
  x: number,
  y: number,
  width: number
): number {
  const lineHeight = 4
  doc.setFontSize(9)
  doc.setFont('helvetica', 'bold')
  textRgb(doc, COLORS.brandDark)
  const numTxt = `${num}.`
  doc.text(numTxt, x, y)

  doc.setFont('helvetica', 'normal')
  textRgb(doc, COLORS.textPrimary)
  const lines = doc.splitTextToSize(text, width - 6)
  lines.forEach((line: string, i: number) => {
    doc.text(line, x + 6, y + i * lineHeight)
  })
  return y + lines.length * lineHeight + 3
}

/**
 * Bloque de firmas anclado al pie de la hoja A4 (margen inferior reservado).
 */
/**
 * Bloque de firmas. Por defecto se ancla cerca del pie (`pageHeight - 36`)
 * pero si el `currentY` (posición de flujo del contenido) ya pasó ese
 * umbral, se renderiza justo debajo del contenido — así nunca aparece
 * ARRIBA del texto "Y en prueba de conformidad..." cuando la página es densa.
 */
export function drawSignatureBlock(
  doc: jsPDF,
  leftLabel: string,
  rightLabel: string,
  pageWidth: number,
  pageHeight: number,
  margin: number,
  currentY?: number
): number {
  const anchorY = pageHeight - 36
  // Si el contenido ya llegó cerca del ancla, fluimos debajo con 2mm de gap
  // (firmas bien pegadas al texto de conformidad).
  const y =
    currentY != null && currentY + 2 > anchorY ? currentY + 2 : anchorY
  const colW = (pageWidth - margin * 2 - 10) / 2
  const leftX = margin
  const rightX = margin + colW + 10

  doc.setFontSize(8.5)
  doc.setFont('helvetica', 'bold')
  textRgb(doc, COLORS.textSecondary)
  doc.text(leftLabel, leftX, y)
  doc.text(rightLabel, rightX, y)

  // Líneas de firma
  strokeRgb(doc, COLORS.textPrimary)
  doc.setLineWidth(0.3)
  doc.line(leftX, y + 14, leftX + colW, y + 14)
  doc.line(rightX, y + 14, rightX + colW, y + 14)

  doc.setFontSize(6.8)
  doc.setFont('helvetica', 'normal')
  textRgb(doc, COLORS.textMuted)
  doc.text('Firma y, en su caso, sello', leftX, y + 17.5)
  doc.text('Firma', rightX, y + 17.5)

  textRgb(doc, COLORS.textPrimary)
  return y + 18
}

/**
 * Footer corporativo (siempre al fondo de la página). Línea fina de marca +
 * texto centrado con razón social, CIF y página.
 */
export function drawFooter(
  doc: jsPDF,
  vendor: { legalName: string; cif: string; iban?: string },
  pageWidth: number,
  pageHeight: number,
  margin: number
) {
  const y = pageHeight - 15
  strokeRgb(doc, COLORS.brandDark)
  doc.setLineWidth(0.4)
  doc.line(margin, y, pageWidth - margin, y)

  doc.setFontSize(5.5)
  doc.setFont('helvetica', 'normal')
  textRgb(doc, COLORS.textSecondary)
  doc.text('Gracias por su confianza', pageWidth / 2, y + 3.5, { align: 'center' })

  doc.setFont('helvetica', 'bold')
  textRgb(doc, COLORS.textPrimary)
  doc.text(
    `${vendor.legalName} · CIF ${vendor.cif}`,
    pageWidth / 2,
    y + 6.5,
    { align: 'center' }
  )

  if (vendor.iban) {
    doc.setFont('helvetica', 'normal')
    textRgb(doc, COLORS.textSecondary)
    doc.text(`Pago por transferencia · IBAN ${vendor.iban}`, pageWidth / 2, y + 9.5, {
      align: 'center',
    })
  }
}

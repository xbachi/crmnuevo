import { jsPDF } from 'jspdf'
import { capitalizeText } from '@/lib/utils'

// Función para convertir números a letras (reutilizada de contractGenerator.ts)
function numeroALetras(numero: number): string {
  const unidades = [
    '',
    'uno',
    'dos',
    'tres',
    'cuatro',
    'cinco',
    'seis',
    'siete',
    'ocho',
    'nueve',
    'diez',
    'once',
    'doce',
    'trece',
    'catorce',
    'quince',
    'dieciséis',
    'diecisiete',
    'dieciocho',
    'diecinueve',
  ]

  const decenas = [
    '',
    '',
    'veinte',
    'treinta',
    'cuarenta',
    'cincuenta',
    'sesenta',
    'setenta',
    'ochenta',
    'noventa',
  ]

  const centenas = [
    '',
    'cien',
    'doscientos',
    'trescientos',
    'cuatrocientos',
    'quinientos',
    'seiscientos',
    'setecientos',
    'ochocientos',
    'novecientos',
  ]

  if (numero === 0) return 'cero'
  if (numero < 20) return unidades[numero]

  if (numero < 100) {
    const decena = Math.floor(numero / 10)
    const unidad = numero % 10
    if (unidad === 0) return decenas[decena]
    return `${decenas[decena]} y ${unidades[unidad]}`
  }

  if (numero < 1000) {
    const centena = Math.floor(numero / 100)
    const resto = numero % 100
    if (resto === 0) {
      // Caso especial: 100 -> "cien", no "ciento"
      if (centena === 1) {
        return 'cien'
      }
      return centenas[centena]
    }
    return `${centenas[centena]} ${numeroALetras(resto)}`
  }

  if (numero < 1000000) {
    const miles = Math.floor(numero / 1000)
    const restoMiles = numero % 1000
    let milesTexto = ''

    if (miles === 1) {
      milesTexto = 'mil'
    } else {
      milesTexto = numeroALetras(miles) + ' mil'
    }

    if (restoMiles === 0) {
      // Caso especial: 100 -> "cien mil", no "ciento mil"
      if (miles === 1) {
        milesTexto = 'mil'
      }
      return milesTexto
    }

    return `${milesTexto} ${numeroALetras(restoMiles)}`
  }

  return numero.toString()
}

export async function generarContratoCocheR(data: {
  vehiculo: {
    marca: string
    modelo: string
    año: number
    matricula: string
    bastidor: string
    kilometraje: number
  }
  cliente: {
    nombre: string
    apellidos: string
    dni: string
    direccion: string
  }
  precioVenta: number
}): Promise<Buffer> {
  const doc = new jsPDF()

  // Configuración de página
  const pageWidth = 210 // A4 width in mm
  const margin = 20
  const lineHeight = 6
  let yPosition = margin

  // Función para agregar texto con salto de línea automático
  const addText = (text: string, x: number, y: number, maxWidth?: number) => {
    if (maxWidth) {
      const lines = doc.splitTextToSize(text, maxWidth)
      doc.text(lines, x, y)
      return y + lines.length * lineHeight
    } else {
      doc.text(text, x, y)
      return y + lineHeight
    }
  }

  // Función para agregar campo con etiqueta
  const addField = (label: string, value: string, x: number, y: number) => {
    doc.setFontSize(10)
    doc.setTextColor(100, 100, 100)
    doc.text(label, x, y)
    doc.setFontSize(11)
    doc.setTextColor(0, 0, 0)
    doc.setFont('helvetica', 'bold')
    doc.text(value, x + 30, y)
    doc.setFont('helvetica', 'normal')
    return y + lineHeight
  }

  // Logo (usando texto por ahora)
  doc.setFontSize(16)
  doc.setFont('helvetica', 'bold')
  doc.setTextColor(30, 64, 175) // Azul
  doc.text('SEVEN CARS MOTORS S.L.', pageWidth / 2, yPosition, {
    align: 'center',
  })
  yPosition += 15

  // Título
  doc.setFontSize(14)
  doc.setFont('helvetica', 'bold')
  doc.setTextColor(0, 0, 0)
  doc.text(
    'CONTRATO DE COMPRAVENTA DE VEHÍCULO "EN EL ESTADO"',
    pageWidth / 2,
    yPosition,
    { align: 'center' }
  )
  yPosition += 10

  // Fecha y lugar
  const fechaActual = new Date().toLocaleDateString('es-ES', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })
  doc.setFontSize(11)
  doc.setFont('helvetica', 'normal')
  doc.text(`En Alaquas, a ${fechaActual}`, pageWidth / 2, yPosition, {
    align: 'center',
  })
  yPosition += 15

  // REUNIDOS
  doc.setFontSize(12)
  doc.setFont('helvetica', 'bold')
  doc.text('REUNIDOS', margin, yPosition)
  yPosition += 8

  // De una parte
  doc.setFontSize(11)
  doc.setFont('helvetica', 'normal')
  yPosition = addText('De una parte,', margin, yPosition)
  yPosition = addText(
    'Sevencars con domicilio en Camí els Mollons, 36, 46970 Alaquàs, Valencia CIF B75939868, representada en este acto por Don/Doña Sebastian Pelella z0147238c, en su calidad de Administrador, en adelante "EL VENDEDOR".',
    margin + 10,
    yPosition,
    pageWidth - margin * 2 - 10
  )
  yPosition += 5

  // Y de otra parte
  yPosition = addText('Y de otra parte,', margin, yPosition)
  yPosition = addText(
    `${capitalizeText(data.cliente.nombre)} ${capitalizeText(data.cliente.apellidos)} con domicilio en ${data.cliente.direccion}, DNI ${data.cliente.dni} en adelante "EL COMPRADOR".`,
    margin + 10,
    yPosition,
    pageWidth - margin * 2 - 10
  )
  yPosition += 10

  // MANIFIESTAN
  doc.setFontSize(12)
  doc.setFont('helvetica', 'bold')
  doc.text('MANIFIESTAN', margin, yPosition)
  yPosition += 8

  // Punto 1
  doc.setFontSize(11)
  doc.setFont('helvetica', 'normal')
  yPosition = addText(
    '1. Que EL VENDEDOR es titular de pleno derecho del vehículo cuyas características se detallan a continuación:',
    margin,
    yPosition
  )
  yPosition += 3

  // Características del vehículo
  yPosition = addField(
    'Marca / Modelo:',
    `${capitalizeText(data.vehiculo.marca)} / ${capitalizeText(data.vehiculo.modelo)}`,
    margin + 10,
    yPosition
  )
  yPosition = addField(
    'Año / Matriculación:',
    `${data.vehiculo.año}`,
    margin + 10,
    yPosition
  )
  yPosition = addField(
    'Matrícula:',
    data.vehiculo.matricula.toUpperCase(),
    margin + 10,
    yPosition
  )
  yPosition = addField(
    'Bastidor (VIN):',
    data.vehiculo.bastidor.toUpperCase(),
    margin + 10,
    yPosition
  )
  yPosition = addField(
    'Kilometraje:',
    `${data.vehiculo.kilometraje.toLocaleString()} km`,
    margin + 10,
    yPosition
  )
  yPosition += 5

  // Punto 2
  yPosition = addText(
    '2. Que EL COMPRADOR es un profesional del sector de compraventa de vehículos y tiene plena capacidad para celebrar este contrato.',
    margin,
    yPosition
  )
  yPosition += 5

  // Punto 3
  yPosition = addText(
    '3. Que ambas partes, reconociéndose mutuamente capacidad jurídica, libremente acuerdan la compraventa del vehículo "en el estado" ("as is"), sin garantía por daños estéticos o mecánicos.',
    margin,
    yPosition
  )
  yPosition += 10

  // CLÁUSULAS
  doc.setFontSize(12)
  doc.setFont('helvetica', 'bold')
  doc.text('CLÁUSULAS', margin, yPosition)
  yPosition += 8

  // Cláusula 1
  doc.setFontSize(11)
  doc.setFont('helvetica', 'bold')
  yPosition = addText('1. Objeto de la venta', margin, yPosition)
  doc.setFont('helvetica', 'normal')
  yPosition = addText(
    'EL VENDEDOR vende a EL COMPRADOR, que adquiere, el vehículo descrito en el Expositivo 1, junto con sus accesorios y documentación original.',
    margin + 10,
    yPosition,
    pageWidth - margin * 2 - 10
  )
  yPosition += 5

  // Cláusula 2
  doc.setFont('helvetica', 'bold')
  yPosition = addText('2. Precio y forma de pago', margin, yPosition)
  doc.setFont('helvetica', 'normal')
  yPosition = addText(
    `2.1. El precio total convenido asciende a ${data.precioVenta.toLocaleString()}€ (${numeroALetras(data.precioVenta)} euros).`,
    margin + 10,
    yPosition,
    pageWidth - margin * 2 - 10
  )
  yPosition = addText(
    '2.2. El pago se realizará en el acto mediante efectivo.',
    margin + 10,
    yPosition,
    pageWidth - margin * 2 - 10
  )
  yPosition += 5

  // Cláusula 3
  doc.setFont('helvetica', 'bold')
  yPosition = addText(
    '3. Entrega y transmisión de la posesión',
    margin,
    yPosition
  )
  doc.setFont('helvetica', 'normal')
  yPosition = addText(
    '3.1. La entrega material del vehículo y de la documentación (permiso de circulación, ficha técnica, contrato de compraventa firmado, etc.) se efectuará en Sevencars en la fecha de firma.',
    margin + 10,
    yPosition,
    pageWidth - margin * 2 - 10
  )
  yPosition = addText(
    '3.2. A partir de ese momento, todos los riesgos y gastos derivados del vehículo (seguros, ITV, mantenimiento, reparaciones, sanciones) correrán a cargo de EL COMPRADOR.',
    margin + 10,
    yPosition,
    pageWidth - margin * 2 - 10
  )
  yPosition += 5

  // Cláusula 4
  doc.setFont('helvetica', 'bold')
  yPosition = addText(
    '4. Estado del vehículo y exención de garantía',
    margin,
    yPosition
  )
  doc.setFont('helvetica', 'normal')
  yPosition = addText(
    '4.1. EL COMPRADOR declara haber inspeccionado el vehículo previamente y acepta expresamente su estado estético y mecánico.',
    margin + 10,
    yPosition,
    pageWidth - margin * 2 - 10
  )
  yPosition = addText(
    '4.2. EL VENDEDOR informa y EL COMPRADOR acepta que el vehículo presenta daños tanto estéticos (abolladuras, arañazos, pintura deteriorada, etc.) como mecánicos.',
    margin + 10,
    yPosition,
    pageWidth - margin * 2 - 10
  )
  yPosition = addText(
    '4.3. EL COMPRADOR renuncia a cualquier reclamación futura derivada de vicios, defectos o desperfectos, conocidos o desconocidos, que afecten al vehículo. En consecuencia, EL VENDEDOR NO otorga NINGUNA garantía, ni expresa ni implícita, de conformidad con lo establecido en el artículo 1.445 del Código Civil.',
    margin + 10,
    yPosition,
    pageWidth - margin * 2 - 10
  )
  yPosition += 5

  // Cláusula 5
  doc.setFont('helvetica', 'bold')
  yPosition = addText('5. Responsabilidades y cargas', margin, yPosition)
  doc.setFont('helvetica', 'normal')
  yPosition = addText(
    '5.1. EL VENDEDOR garantiza únicamente su titularidad y que el vehículo está libre de cargas y gravámenes.',
    margin + 10,
    yPosition,
    pageWidth - margin * 2 - 10
  )
  yPosition = addText(
    '5.2. EL COMPRADOR asume toda responsabilidad por cualquier incumplimiento legal, notificando o coste derivado tras la firma del contrato.',
    margin + 10,
    yPosition,
    pageWidth - margin * 2 - 10
  )
  yPosition += 5

  // Cláusula 6
  doc.setFont('helvetica', 'bold')
  yPosition = addText('6. Gastos e impuestos', margin, yPosition)
  doc.setFont('helvetica', 'normal')
  yPosition = addText(
    '6.1. Los gastos e impuestos de transmisión (Impuesto de Transmisiones Patrimoniales, tasas de tráfico, gestoría, etc.) correrán a cargo de EL COMPRADOR.',
    margin + 10,
    yPosition,
    pageWidth - margin * 2 - 10
  )
  yPosition = addText(
    '6.2. EL VENDEDOR entregará la factura o justificante de venta y colaborará en los trámites que estime necesarios.',
    margin + 10,
    yPosition,
    pageWidth - margin * 2 - 10
  )
  yPosition += 5

  // Cláusula 7
  doc.setFont('helvetica', 'bold')
  yPosition = addText('7. Jurisdicción y ley aplicable', margin, yPosition)
  doc.setFont('helvetica', 'normal')
  yPosition = addText(
    '7.1. Para la interpretación y cumplimiento de este contrato, las partes se someten a la Ley española.',
    margin + 10,
    yPosition,
    pageWidth - margin * 2 - 10
  )
  yPosition = addText(
    '7.2. Cualquier controversia se someterá a los Juzgados y Tribunales de Valencia, renunciando expresamente a cualquier otro fuero.',
    margin + 10,
    yPosition,
    pageWidth - margin * 2 - 10
  )
  yPosition += 10

  // Cierre
  doc.setFontSize(11)
  doc.setFont('helvetica', 'normal')
  yPosition = addText(
    'Y en prueba de conformidad, ambas partes firman por duplicado y a un solo efecto, en el lugar y fecha indicados al inicio.',
    margin,
    yPosition
  )
  yPosition += 15

  // Firmas
  doc.setFontSize(12)
  doc.setFont('helvetica', 'bold')
  doc.text('Firmas:', margin, yPosition)
  yPosition += 15

  // Firma vendedor
  doc.setFontSize(11)
  doc.setFont('helvetica', 'normal')
  doc.text('Sebastian Pelella', margin, yPosition)
  doc.text('Administrador – Sevencars Motors SL', margin, yPosition + 5)
  yPosition += 20

  // Línea para firma comprador
  doc.line(margin, yPosition, margin + 80, yPosition)
  yPosition += 5
  doc.text('Comprador:', margin, yPosition)
  yPosition += 5
  doc.text('Profesional / Empresa Compraventa', margin, yPosition)

  // Convertir a Buffer
  return Buffer.from(doc.output('arraybuffer'))
}

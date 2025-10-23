import jsPDF from './jspdf-server'
import { capitalizeText } from '@/lib/utils'

// Función para formatear la fecha de matriculación (igual que en contractGenerator.ts)
function getFechaMatriculacion(vehiculo: any): string {
  if (vehiculo?.fechaMatriculacion) {
    const fecha = new Date(vehiculo.fechaMatriculacion)
    if (!isNaN(fecha.getTime())) {
      // Formato numérico: DD/MM/YYYY
      const dia = fecha.getDate().toString().padStart(2, '0')
      const mes = (fecha.getMonth() + 1).toString().padStart(2, '0')
      const año = fecha.getFullYear()
      return `${dia}/${mes}/${año}`
    }
  }
  return 'No especificada'
}

// Función para cargar el logo PNG y convertirlo a Base64
async function loadLogoSVG(): Promise<string> {
  try {
    console.log('🖼️ [LOGO] Iniciando carga del logo...')

    // Verificar si estamos en el servidor (Node.js) o en el cliente (browser)
    if (typeof window === 'undefined') {
      // Servidor: usar fs para leer el archivo
      try {
        const fs = await import('fs')
        const path = await import('path')

        const logoPath = path.join(process.cwd(), 'public', 'logocontrato.png')
        console.log('🖼️ [LOGO] Leyendo logo desde servidor:', logoPath)

        // Verificar si el archivo existe
        if (!fs.existsSync(logoPath)) {
          console.warn('⚠️ [LOGO] Archivo logo no encontrado en:', logoPath)
          // Intentar usar fetch como fallback en servidor
          try {
            console.log('🔄 [LOGO] Intentando fetch como fallback...')
            // Usar diferentes URLs según el entorno
            const baseUrl = process.env.VERCEL_URL
              ? `https://${process.env.VERCEL_URL}`
              : process.env.NODE_ENV === 'production'
                ? 'https://sevencars.vercel.app' // URL específica de Vercel
                : 'http://localhost:3000'

            console.log('🌐 [LOGO] Usando URL base:', baseUrl)
            const response = await fetch(`${baseUrl}/logocontrato.png`)
            if (response.ok) {
              const buffer = await response.arrayBuffer()
              const base64 = Buffer.from(buffer).toString('base64')
              const dataURL = `data:image/png;base64,${base64}`
              console.log('✅ [LOGO] Logo cargado via fetch exitosamente')
              return dataURL
            }
          } catch (fetchError) {
            console.warn(
              '⚠️ [LOGO] Error en fetch fallback:',
              (fetchError as Error).message
            )
          }
          return ''
        }

        // Leer el archivo y convertirlo a base64
        const logoBuffer = fs.readFileSync(logoPath)
        const base64 = logoBuffer.toString('base64')
        const dataURL = `data:image/png;base64,${base64}`
        console.log('✅ [LOGO] Logo cargado desde archivo exitosamente')
        return dataURL
      } catch (fsError) {
        console.warn(
          '⚠️ [LOGO] Error leyendo archivo:',
          (fsError as Error).message
        )
        return ''
      }
    } else {
      // Cliente: usar fetch
      try {
        const response = await fetch('/logocontrato.png')
        if (response.ok) {
          const blob = await response.blob()
          return new Promise((resolve) => {
            const reader = new FileReader()
            reader.onload = () => resolve(reader.result as string)
            reader.readAsDataURL(blob)
          })
        }
      } catch (fetchError) {
        console.warn('⚠️ [LOGO] Error en fetch:', (fetchError as Error).message)
      }
      return ''
    }
  } catch (error) {
    console.error(
      '❌ [LOGO] Error general cargando logo:',
      (error as Error).message
    )
    return ''
  }
}

// Función para agregar logo a los contratos
async function addLogoToContract(doc: any, yPosition: number): Promise<number> {
  try {
    console.log('🖼️ [LOGO] Intentando cargar logo PNG...')

    const logoDataURL = await loadLogoSVG()
    if (logoDataURL) {
      console.log('✅ [LOGO] Logo cargado exitosamente, agregando al PDF...')

      // Centrar el logo en el documento (ancho de página 210mm, logo 50mm)
      const pageWidth = 210
      const logoWidth = 50
      const logoHeight = 20
      const logoX = (pageWidth - logoWidth) / 2

      try {
        doc.addImage(
          logoDataURL,
          'PNG',
          logoX,
          yPosition,
          logoWidth,
          logoHeight
        )
        console.log('✅ [LOGO] Logo agregado al PDF exitosamente')
        return yPosition + logoHeight + 15 // Espacio después del logo
      } catch (addImageError) {
        console.warn(
          '⚠️ [LOGO] Error agregando imagen al PDF:',
          (addImageError as Error).message
        )
        // Fallback al texto si addImage falla
        doc.setFontSize(14)
        doc.setFont('helvetica', 'bold')
        doc.setTextColor(30, 64, 175) // Azul
        doc.text('SEVEN CARS MOTORS S.L.', 105, yPosition, { align: 'center' })
        return yPosition + 15
      }
    } else {
      console.warn(
        '⚠️ [LOGO] No se pudo cargar el logo, usando texto como fallback'
      )
      // Fallback al texto si no se puede cargar el logo
      doc.setFontSize(14)
      doc.setFont('helvetica', 'bold')
      doc.setTextColor(30, 64, 175) // Azul
      doc.text('SEVEN CARS MOTORS S.L.', 105, yPosition, { align: 'center' })
      return yPosition + 15
    }
  } catch (error) {
    console.error('❌ [LOGO] Error agregando logo:', (error as Error).message)
    // Fallback al texto en caso de error
    doc.setFontSize(14)
    doc.setFont('helvetica', 'bold')
    doc.setTextColor(30, 64, 175) // Azul
    doc.text('SEVEN CARS MOTORS S.L.', 105, yPosition, { align: 'center' })
    return yPosition + 15
  }
}

// Función helper para escribir campos con plantilla (igual que en contractGenerator.ts)
function writeField(
  doc: jsPDF,
  label: string,
  value: string,
  x: number,
  y: number,
  fontSize: number = 10
): void {
  doc.setFontSize(fontSize)
  doc.setFont('helvetica', 'normal')
  doc.setTextColor(0, 0, 0) // Negro
  doc.text(`${label}:`, x, y)

  // Calcular posición del valor (después de la etiqueta)
  const labelWidth = doc.getTextWidth(`${label}:`)
  const valueX = x + labelWidth + 2 // 2mm de espacio

  doc.setFont('helvetica', 'bold')
  doc.text(value, valueX, y)
}

// Clase para manejar el cursor dinámico con páginas múltiples
class PDFCursor {
  private y: number
  private doc: jsPDF
  private margin: number
  private lineHeight: number
  private pageHeight: number
  private bottomMargin: number

  constructor(doc: jsPDF, startY: number = 10) {
    // Reducido de 30 a 10 para quitar 20px de margen superior
    this.doc = doc
    this.y = startY
    this.margin = 20
    this.lineHeight = 5
    this.pageHeight = doc.internal.pageSize.getHeight()
    this.bottomMargin = 15 // Reducido de 30 a 15 para menos margen inferior
  }

  // Verificar si necesitamos una nueva página
  checkPageBreak(requiredSpace: number = 10): void {
    if (this.y + requiredSpace > this.pageHeight - this.bottomMargin) {
      this.doc.addPage()
      this.y = this.margin
    }
  }

  // Mover cursor hacia abajo
  moveDown(lines: number = 1): void {
    this.y += lines * this.lineHeight
    this.checkPageBreak()
  }

  // Obtener posición actual
  getY(): number {
    return this.y
  }

  // Establecer posición Y
  setY(y: number): void {
    this.y = y
    this.checkPageBreak()
  }

  // Escribir texto con splitTextToSize para campos largos
  writeLongText(text: string, maxWidth: number, fontSize: number = 10): void {
    this.doc.setFontSize(fontSize)
    const lines = this.doc.splitTextToSize(text, maxWidth)

    // Escribir línea por línea, verificando saltos de página
    for (let i = 0; i < lines.length; i++) {
      this.checkPageBreak()
      this.doc.text(lines[i], this.margin, this.y)
      this.y += this.lineHeight
    }
  }

  // Escribir título
  writeTitle(text: string): void {
    this.checkPageBreak(15)
    this.doc.setFontSize(16)
    this.doc.setFont('helvetica', 'bold')
    this.doc.text(text, this.margin, this.y)
    this.doc.setFont('helvetica', 'normal')
    this.moveDown(2)
  }

  // Escribir subtítulo
  writeSubtitle(text: string): void {
    this.checkPageBreak(10)
    this.doc.setFontSize(12)
    this.doc.setFont('helvetica', 'bold')
    this.doc.text(text, this.margin, this.y)
    this.doc.setFont('helvetica', 'normal')
    this.moveDown()
  }

  // Agregar espacio
  addSpace(lines: number = 1): void {
    this.moveDown(lines)
  }
}

// Función para convertir números a letras (reutilizada de contractGenerator.ts)
function numeroALetras(numero: number): string {
  try {
    console.log('🔢 [NUMERO A LETRAS] Convirtiendo:', numero)
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
        return milesTexto
      }

      return `${milesTexto} ${numeroALetras(restoMiles)}`
    }

    const result = numero.toString()
    console.log('🔢 [NUMERO A LETRAS] Resultado:', result)
    return result
  } catch (error) {
    console.error('❌ [NUMERO A LETRAS] Error:', error)
    return numero.toString()
  }
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
  try {
    console.log('📄 [PDF GENERATOR] Iniciando generación de contrato')
    console.log('📄 [PDF GENERATOR] Datos recibidos:', data)

    const doc = new jsPDF()
    const cursor = new PDFCursor(doc)

    // Configuración de página
    const pageWidth = 210 // A4 width in mm
    const margin = 20
    const maxWidth = pageWidth - margin * 2

    // Logo de Seven Cars (primero)
    console.log('🖼️ [CONTRATO COCHE R] Agregando logo...')
    let yPosition = await addLogoToContract(doc, cursor.getY())
    cursor.setY(yPosition)
    console.log('✅ [CONTRATO COCHE R] Logo agregado, yPosition:', yPosition)

    // Título del contrato (después del logo)
    doc.setFontSize(14)
    doc.setFont('helvetica', 'bold')
    doc.setTextColor(0, 0, 0) // Negro
    doc.text(
      'CONTRATO DE COMPRAVENTA DE VEHÍCULO "EN EL ESTADO"',
      pageWidth / 2,
      cursor.getY(),
      {
        align: 'center',
      }
    )
    cursor.moveDown(1.6)

    // Línea decorativa
    doc.setDrawColor(0, 0, 0)
    doc.setLineWidth(0.5)
    doc.line(margin, cursor.getY(), pageWidth - margin, cursor.getY())
    cursor.moveDown(3.6) // Separar "En Alaquas" de la línea divisoria

    // Fecha y lugar
    const fecha = new Date().toLocaleDateString('es-ES', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    })
    doc.setFontSize(11)
    doc.setFont('helvetica', 'normal')
    doc.setTextColor(0, 0, 0) // Negro
    doc.text(`En Alaquas, a ${fecha}`, margin, cursor.getY())
    cursor.moveDown(2.4)

    // REUNIDOS
    doc.setFont('helvetica', 'bold')
    doc.setTextColor(0, 0, 0) // Negro
    doc.text('REUNIDOS', margin, cursor.getY())
    cursor.moveDown(1.6)

    // De una parte
    doc.setFont('helvetica', 'normal')
    doc.setTextColor(0, 0, 0) // Negro
    doc.text('De una parte:', margin, cursor.getY())
    cursor.moveDown(1.2)

    const textoVendedor =
      'Sevencars Motors SL con domicilio en Camí els Mollons, 36, 46970 Alaquàs, Valencia CIF B75939868, representada en este acto por D. Sebastián Pelella z0147238c, en su calidad de Administrador, en adelante "EL VENDEDOR".'
    doc.text(
      doc.splitTextToSize(textoVendedor, pageWidth - margin * 2),
      margin,
      cursor.getY()
    )
    cursor.moveDown(3)

    // Y de otra parte
    doc.setTextColor(0, 0, 0) // Negro
    cursor.moveDown(0.8) // Espacio adicional antes de "Y de otra parte:"
    doc.text('Y de otra parte:', margin, cursor.getY())
    cursor.moveDown(1.2)

    const nombreCompleto = `${data.cliente.nombre} ${data.cliente.apellidos}`
    const textoComprador = `${nombreCompleto} con domicilio en ${data.cliente.direccion}, DNI ${data.cliente.dni} en adelante "EL COMPRADOR".`
    doc.text(
      doc.splitTextToSize(textoComprador, pageWidth - margin * 2),
      margin,
      cursor.getY()
    )
    cursor.moveDown(3.6)

    // MANIFIESTAN
    doc.setFont('helvetica', 'bold')
    doc.setTextColor(0, 0, 0) // Negro
    doc.text('MANIFIESTAN', margin, cursor.getY())
    cursor.moveDown(1.6)

    // Punto 1 - Datos del vehículo
    doc.setFontSize(11) // Mismo tamaño que los otros puntos
    doc.setFont('helvetica', 'normal')
    doc.setTextColor(0, 0, 0) // Negro
    const textoPunto1 =
      '1. Que EL VENDEDOR es titular de pleno derecho del vehículo cuyas características se detallan a continuación:'

    // Dividir el texto en líneas que se ajusten al ancho de la página
    const lineasPunto1 = doc.splitTextToSize(
      textoPunto1,
      pageWidth - margin * 2
    )

    // Escribir cada línea
    for (let i = 0; i < lineasPunto1.length; i++) {
      doc.text(lineasPunto1[i], margin, cursor.getY())
      cursor.moveDown(1.2)
    }

    // Datos del vehículo en 2 columnas
    const columnaIzquierda = margin + 10
    const columnaDerecha = pageWidth / 2 + 10

    // Columna izquierda: MARCA, MODELO, AÑO, MATRÍCULA
    writeField(
      doc,
      'MARCA',
      capitalizeText(data.vehiculo.marca) || 'marca vehiculo',
      columnaIzquierda,
      cursor.getY()
    )
    writeField(
      doc,
      'MODELO',
      capitalizeText(data.vehiculo.modelo) || 'modelo vehiculo',
      columnaIzquierda,
      cursor.getY() + 6
    )
    writeField(
      doc,
      'FECHA DE MATRICULACIÓN',
      getFechaMatriculacion(data.vehiculo),
      columnaIzquierda,
      cursor.getY() + 12
    )
    writeField(
      doc,
      'MATRÍCULA',
      data.vehiculo.matricula?.toUpperCase() || 'no especificada',
      columnaIzquierda,
      cursor.getY() + 18
    )

    // Columna derecha: BASTIDOR, KILOMETRAJE
    writeField(
      doc,
      'BASTIDOR',
      data.vehiculo.bastidor?.toUpperCase() || 'no especificado',
      columnaDerecha,
      cursor.getY()
    )
    writeField(
      doc,
      'KILOMETRAJE',
      data.vehiculo.kilometraje
        ? `${data.vehiculo.kilometraje.toLocaleString('es-ES')} km`
        : 'No especificado',
      columnaDerecha,
      cursor.getY() + 6
    )

    cursor.moveDown(6) // Espacio después de los datos del vehículo

    // Punto 2
    doc.setFontSize(11) // Mismo tamaño que los otros puntos
    doc.setFont('helvetica', 'normal')
    doc.setTextColor(0, 0, 0) // Negro
    const textoPunto2 =
      '2. Que EL COMPRADOR es un profesional del sector de compraventa de vehículos y tiene plena capacidad para celebrar este contrato.'

    // Dividir el texto en líneas que se ajusten al ancho de la página
    const lineasPunto2 = doc.splitTextToSize(
      textoPunto2,
      pageWidth - margin * 2
    )

    // Escribir cada línea
    for (let i = 0; i < lineasPunto2.length; i++) {
      doc.text(lineasPunto2[i], margin, cursor.getY())
      cursor.moveDown(1.2)
    }
    cursor.addSpace()

    // Punto 3
    doc.setFontSize(11) // Mismo tamaño que los otros puntos
    doc.setFont('helvetica', 'normal')
    doc.setTextColor(0, 0, 0) // Negro
    const textoPunto3 =
      '3. Que ambas partes, reconociéndose mutuamente capacidad jurídica, libremente acuerdan la compraventa del vehículo "en el estado" ("as is"), sin garantía por daños estéticos o mecánicos.'

    // Dividir el texto en líneas que se ajusten al ancho de la página
    const lineasPunto3 = doc.splitTextToSize(
      textoPunto3,
      pageWidth - margin * 2
    )

    // Escribir cada línea
    for (let i = 0; i < lineasPunto3.length; i++) {
      doc.text(lineasPunto3[i], margin, cursor.getY())
      cursor.moveDown(1.2)
    }
    cursor.addSpace(2)

    // CLÁUSULAS
    cursor.writeSubtitle('CLÁUSULAS')

    // Cláusula 1
    cursor.checkPageBreak(15)
    doc.setFontSize(11)
    doc.setFont('helvetica', 'bold')
    doc.setTextColor(0, 0, 0) // Negro
    doc.text('1. Objeto de la venta', margin, cursor.getY())
    cursor.moveDown()
    doc.setFont('helvetica', 'normal')
    doc.setTextColor(0, 0, 0) // Negro
    const clausula1 =
      'EL VENDEDOR vende a EL COMPRADOR, que adquiere, el vehículo descrito en el Expositivo 1, junto con sus accesorios y documentación original.'
    cursor.writeLongText(clausula1, maxWidth - 10, 11)
    cursor.addSpace()

    // Cláusula 2
    cursor.checkPageBreak(15)
    doc.setFont('helvetica', 'bold')
    doc.setTextColor(0, 0, 0) // Negro
    doc.text('2. Precio y forma de pago', margin, cursor.getY())
    cursor.moveDown()
    doc.setFont('helvetica', 'normal')
    doc.setTextColor(0, 0, 0) // Negro
    const precioEnLetras = numeroALetras(data.precioVenta)
    const clausula2 = `2.1. El precio total convenido asciende a ${data.precioVenta.toLocaleString('es-ES')}€ (${precioEnLetras} euros).\n2.2. El pago se realizará en el acto mediante efectivo.`
    cursor.writeLongText(clausula2, maxWidth - 10, 11)
    cursor.addSpace()

    // Cláusula 3
    cursor.checkPageBreak(15)
    doc.setFont('helvetica', 'bold')
    doc.setTextColor(0, 0, 0) // Negro
    doc.text('3. Entrega y transmisión de la posesión', margin, cursor.getY())
    cursor.moveDown()
    doc.setFont('helvetica', 'normal')
    doc.setTextColor(0, 0, 0) // Negro
    const clausula3 = `3.1. La entrega material del vehículo y de la documentación (permiso de circulación, ficha técnica, contrato de compraventa firmado, etc.) se efectuará en Sevencars en la fecha de firma.\n3.2. A partir de ese momento, todos los riesgos y gastos derivados del vehículo (seguros, ITV, mantenimiento, reparaciones, sanciones) correrán a cargo de EL COMPRADOR.`
    cursor.writeLongText(clausula3, maxWidth - 10, 11)
    cursor.addSpace()

    // Cláusula 4
    cursor.checkPageBreak(20)
    doc.setFont('helvetica', 'bold')
    doc.setTextColor(0, 0, 0) // Negro
    doc.text(
      '4. Estado del vehículo y exención de garantía',
      margin,
      cursor.getY()
    )
    cursor.moveDown()
    doc.setFont('helvetica', 'normal')
    doc.setTextColor(0, 0, 0) // Negro
    const clausula4 = `4.1. EL COMPRADOR declara haber inspeccionado el vehículo previamente y acepta expresamente su estado estético y mecánico.\n4.2. EL VENDEDOR informa y EL COMPRADOR acepta que el vehículo presenta daños tanto estéticos (abolladuras, arañazos, pintura deteriorada, etc.) como mecánicos.\n4.3. EL COMPRADOR renuncia a cualquier reclamación futura derivada de vicios, defectos o desperfectos, conocidos o desconocidos, que afecten al vehículo. En consecuencia, EL VENDEDOR NO otorga NINGUNA garantía, ni expresa ni implícita, de conformidad con lo establecido en el artículo 1.445 del Código Civil.`
    cursor.writeLongText(clausula4, maxWidth - 10, 11)
    cursor.addSpace()

    // Cláusula 5
    cursor.checkPageBreak(15)
    doc.setFont('helvetica', 'bold')
    doc.setTextColor(0, 0, 0) // Negro
    doc.text('5. Responsabilidades y cargas', margin, cursor.getY())
    cursor.moveDown()
    doc.setFont('helvetica', 'normal')
    doc.setTextColor(0, 0, 0) // Negro
    const clausula5 = `5.1. EL VENDEDOR garantiza únicamente su titularidad y que el vehículo está libre de cargas y gravámenes.\n5.2. EL COMPRADOR asume toda responsabilidad por cualquier incumplimiento legal, notificando o coste derivado tras la firma del contrato.`
    cursor.writeLongText(clausula5, maxWidth - 10, 11)
    cursor.addSpace()

    // Cláusula 6
    cursor.checkPageBreak(15)
    doc.setFont('helvetica', 'bold')
    doc.setTextColor(0, 0, 0) // Negro
    doc.text('6. Gastos e impuestos', margin, cursor.getY())
    cursor.moveDown()
    doc.setFont('helvetica', 'normal')
    doc.setTextColor(0, 0, 0) // Negro
    const clausula6 = `6.1. Los gastos e impuestos de transmisión (Impuesto de Transmisiones Patrimoniales, tasas de tráfico, gestoría, etc.) correrán a cargo de EL COMPRADOR.\n6.2. EL VENDEDOR entregará la factura o justificante de venta y colaborará en los trámites que estime necesarios.`
    cursor.writeLongText(clausula6, maxWidth - 10, 11)
    cursor.addSpace()

    // Cláusula 7
    cursor.checkPageBreak(15)
    doc.setFont('helvetica', 'bold')
    doc.setTextColor(0, 0, 0) // Negro
    doc.text('7. Jurisdicción y ley aplicable', margin, cursor.getY())
    cursor.moveDown()
    doc.setFont('helvetica', 'normal')
    doc.setTextColor(0, 0, 0) // Negro
    const clausula7 = `7.1. Para la interpretación y cumplimiento de este contrato, las partes se someten a la Ley española.\n7.2. Cualquier controversia se someterá a los Juzgados y Tribunales de Valencia, renunciando expresamente a cualquier otro fuero.`
    cursor.writeLongText(clausula7, maxWidth - 10, 11)
    cursor.addSpace(2)

    // Cierre
    doc.setFontSize(11)
    doc.setFont('helvetica', 'normal')
    doc.setTextColor(0, 0, 0) // Negro
    const textoCierre =
      'Y en prueba de conformidad, ambas partes firman por duplicado y a un solo efecto, en el lugar y fecha indicados al inicio.'

    // Dividir el texto en líneas que se ajusten al ancho de la página
    const lineasCierre = doc.splitTextToSize(
      textoCierre,
      pageWidth - margin * 2
    )

    // Escribir cada línea
    for (let i = 0; i < lineasCierre.length; i++) {
      doc.text(lineasCierre[i], margin, cursor.getY())
      cursor.moveDown(1.2)
    }
    cursor.moveDown(2)

    // Firmas en 2 columnas
    cursor.checkPageBreak(30)
    doc.setFontSize(11)
    cursor.moveDown(2)

    // Texto de firmas
    doc.text('La parte vendedora', margin, cursor.getY())
    doc.text('La parte compradora', pageWidth / 2 + 10, cursor.getY())
    cursor.moveDown(3)

    // Líneas para firmas
    doc.line(margin, cursor.getY(), margin + 70, cursor.getY())
    doc.line(
      pageWidth / 2 + 10,
      cursor.getY(),
      pageWidth / 2 + 80,
      cursor.getY()
    )

    // Convertir a Buffer
    console.log('📄 [PDF GENERATOR] PDF generado exitosamente')
    const buffer = Buffer.from(doc.output('arraybuffer'))
    console.log(
      '📄 [PDF GENERATOR] Buffer creado, tamaño:',
      buffer.length,
      'bytes'
    )
    return buffer
  } catch (error) {
    console.error('❌ [PDF GENERATOR] Error generando contrato:', error)
    throw new Error(
      `Error generando contrato: ${error instanceof Error ? error.message : 'Error desconocido'}`
    )
  }
}

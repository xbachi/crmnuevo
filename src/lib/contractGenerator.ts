// Generador de contratos con jsPDF
import jsPDF from './jspdf-server'
import { formatCurrency, getVehiculoAño, capitalizeText } from './utils'

// Función para formatear la fecha de matriculación
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

// Clase para manejar el cursor dinámico
class PDFCursor {
  private y: number
  private doc: jsPDF
  private margin: number
  private lineHeight: number

  constructor(doc: jsPDF, startY: number = 30) {
    this.doc = doc
    this.y = startY
    this.margin = 20
    this.lineHeight = 5
  }

  // Mover cursor hacia abajo
  moveDown(lines: number = 1): void {
    this.y += lines * this.lineHeight
  }

  // Obtener posición actual
  getY(): number {
    return this.y
  }

  // Establecer posición Y
  setY(y: number): void {
    this.y = y
  }

  // Escribir campo con etiqueta y valor en la misma línea
  writeField(label: string, value: string, fontSize: number = 10): void {
    this.doc.setFontSize(fontSize)
    this.doc.text(`${label}: ${value}`, this.margin, this.y)
    this.moveDown()
  }

  // Escribir texto simple
  writeText(text: string, fontSize: number = 10, x?: number): void {
    this.doc.setFontSize(fontSize)
    this.doc.text(text, x || this.margin, this.y)
    this.moveDown()
  }

  // Escribir texto con splitTextToSize para campos largos
  writeLongText(text: string, maxWidth: number, fontSize: number = 10): void {
    this.doc.setFontSize(fontSize)
    const lines = this.doc.splitTextToSize(text, maxWidth)
    this.doc.text(lines, this.margin, this.y)
    this.y += lines.length * this.lineHeight
  }

  // Escribir título
  writeTitle(text: string): void {
    this.doc.setFontSize(16)
    this.doc.setFont('helvetica', 'bold')
    this.doc.text(text, this.margin, this.y)
    this.doc.setFont('helvetica', 'normal')
    this.moveDown(2)
  }

  // Escribir subtítulo
  writeSubtitle(text: string): void {
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

// Función helper para escribir campos con plantilla
function writeField(
  doc: any,
  label: string,
  value: string,
  x: number,
  y: number
): void {
  // Escribir etiqueta en normal
  doc.setFont('helvetica', 'normal')
  doc.text(`${label}:`, x, y)

  // Calcular posición del valor basándose en el ancho del texto
  const etiquetaWidth = doc.getTextWidth(`${label}:`)
  const valorX = x + etiquetaWidth + 2 // 2px de separación

  // Escribir valor en negrita
  doc.setFont('helvetica', 'bold')
  doc.text(value, valorX, y)
}

// Función para cargar el logo PNG y convertirlo a Base64
async function loadLogoSVG(): Promise<string> {
  try {
    console.log('🖼️ [LOGO] Iniciando carga del logo...')

    // Verificar si estamos en el servidor (Node.js) o en el cliente (browser)
    if (typeof window === 'undefined') {
      // Servidor: usar fs para leer el archivo
      const fs = await import('fs')
      const path = await import('path')

      const logoPath = path.join(process.cwd(), 'public', 'logocontrato.png')
      console.log('🖼️ [LOGO] Leyendo logo desde servidor:', logoPath)

      const logoBuffer = fs.readFileSync(logoPath)
      const base64 = `data:image/png;base64,${logoBuffer.toString('base64')}`

      console.log(
        '🖼️ [LOGO] Logo cargado desde servidor, tamaño:',
        base64.length,
        'caracteres'
      )
      return base64
    } else {
      // Cliente: usar fetch para cargar el PNG desde /public/
      const response = await fetch('/logocontrato.png')

      if (!response.ok) {
        throw new Error(
          `Error cargando logo: ${response.status} ${response.statusText}`
        )
      }

      console.log('🖼️ [LOGO] PNG cargado correctamente desde /public/')

      // Convertir a blob
      const blob = await response.blob()
      console.log('🖼️ [LOGO] Blob creado, tamaño:', blob.size, 'bytes')

      // Convertir blob a base64 usando FileReader
      const base64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader()
        reader.onload = () => {
          const result = reader.result as string
          resolve(result)
        }
        reader.onerror = reject
        reader.readAsDataURL(blob)
      })

      console.log(
        '🖼️ [LOGO] PNG convertido a base64, tamaño:',
        base64.length,
        'caracteres'
      )
      return base64
    }
  } catch (error) {
    console.error('❌ [LOGO] Error cargando logo PNG:', error)
    return ''
  }
}

// Función para agregar logo a los contratos
async function addLogoToContract(doc: any, yPosition: number): Promise<number> {
  try {
    const logoDataURL = await loadLogoSVG()
    if (logoDataURL) {
      // Centrar el logo en el documento (ancho de página 210mm, logo 50mm)
      const pageWidth = 210
      const logoWidth = 50
      const logoHeight = 20
      const logoX = (pageWidth - logoWidth) / 2

      doc.addImage(logoDataURL, 'PNG', logoX, yPosition, logoWidth, logoHeight)
      return yPosition + logoHeight + 15 // Espacio después del logo
    } else {
      // Fallback al texto si no se puede cargar el logo
      doc.setFontSize(12)
      doc.setFont('helvetica', 'bold')
      doc.setTextColor(0, 0, 0)
      doc.text('SEVEN CARS MOTORS S.L.', 105, yPosition, { align: 'center' })
      return yPosition + 10
    }
  } catch (error) {
    // Fallback al texto si hay error
    doc.setFontSize(12)
    doc.setFont('helvetica', 'bold')
    doc.setTextColor(0, 0, 0)
    doc.text('SEVEN CARS MOTORS S.L.', 105, yPosition, { align: 'center' })
    return yPosition + 10
  }
}

// Función para mapear formas de pago de reserva
function getFormaPagoReserva(formaPago: string): string {
  const formasPago: { [key: string]: string } = {
    contado: 'efectivo',
    financiado: 'transferencia',
    mixto: 'transferencia',
    tarjeta: 'tarjeta',
    transferencia: 'transferencia',
    efectivo: 'efectivo',
    bizum: 'bizum',
  }

  return formasPago[formaPago?.toLowerCase()] || 'efectivo'
}

interface DealData {
  numero: string
  fechaCreacion: Date
  cliente?: {
    nombre: string
    apellidos: string
    dni?: string
    telefono?: string
    email?: string
    direccion?: string
    ciudad?: string
    provincia?: string
    codPostal?: string
  }
  vehiculo?: {
    marca: string
    modelo: string
    matricula: string
    bastidor?: string
    precioPublicacion?: number
    fechaMatriculacion?: string
    año?: number
  }
  importeTotal?: number
  importeSena?: number
  formaPagoSena?: string
  fechaReservaDesde?: Date
  fechaReservaExpira?: Date
}

// Función para convertir números a letras

function numeroALetras(numero: number): string {
  // Redondear a entero para evitar problemas con decimales
  const numeroEntero = Math.floor(numero)

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
  const especiales = [
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
  const centenas = [
    '',
    'ciento',
    'doscientos',
    'trescientos',
    'cuatrocientos',
    'quinientos',
    'seiscientos',
    'setecientos',
    'ochocientos',
    'novecientos',
  ]

  if (numeroEntero === 0) return 'cero'
  if (numeroEntero < 10) return unidades[numeroEntero]
  if (numeroEntero < 20) return especiales[numeroEntero - 10]
  if (numeroEntero < 100) {
    const decena = Math.floor(numeroEntero / 10)
    const unidad = numeroEntero % 10
    if (unidad === 0) return decenas[decena]
    return decenas[decena] + ' y ' + unidades[unidad]
  }
  if (numeroEntero < 1000) {
    const centena = Math.floor(numeroEntero / 100)
    const resto = numeroEntero % 100
    if (resto === 0) {
      // Caso especial: 100 -> "cien", no "ciento"
      if (centena === 1) {
        return 'cien'
      }
      return centenas[centena]
    }
    return centenas[centena] + ' ' + numeroALetras(resto)
  }
  if (numeroEntero < 1000000) {
    const miles = Math.floor(numeroEntero / 1000)
    const resto = numeroEntero % 1000

    // Casos especiales para los miles
    let milesTexto = ''
    if (miles === 1) {
      milesTexto = 'mil'
    } else if (miles < 10) {
      milesTexto = unidades[miles] + ' mil'
    } else if (miles < 20) {
      milesTexto = especiales[miles - 10] + ' mil'
    } else if (miles < 30) {
      const unidad = miles % 10
      if (unidad === 1) {
        milesTexto = 'veintiún mil'
      } else if (unidad === 0) {
        milesTexto = 'veinte mil'
      } else {
        milesTexto = 'veinti' + unidades[unidad] + ' mil'
      }
    } else if (miles < 100) {
      const decena = Math.floor(miles / 10)
      const unidad = miles % 10
      if (unidad === 0) {
        milesTexto = decenas[decena] + ' mil'
      } else {
        milesTexto = decenas[decena] + ' y ' + unidades[unidad] + ' mil'
      }
    } else if (miles < 1000) {
      const centena = Math.floor(miles / 100)
      const restoMiles = miles % 100
      if (restoMiles === 0) {
        // Caso especial: 100 -> "cien mil", no "ciento mil"
        if (centena === 1) {
          milesTexto = 'cien mil'
        } else {
          milesTexto = centenas[centena] + ' mil'
        }
      } else {
        milesTexto =
          centenas[centena] + ' ' + numeroALetras(restoMiles) + ' mil'
      }
    } else {
      milesTexto = numeroALetras(miles) + ' mil'
    }

    let resultado = milesTexto
    if (resto > 0) {
      resultado += ' ' + numeroALetras(resto)
    }
    return resultado
  }
  return numero.toString()
}

// Función para formatear fecha en español
function formatearFecha(fecha: Date | string | null | undefined): string {
  // Convertir a Date si es necesario
  let fechaDate: Date

  if (fecha instanceof Date) {
    fechaDate = fecha
  } else if (typeof fecha === 'string') {
    fechaDate = new Date(fecha)
  } else if (fecha) {
    fechaDate = new Date(fecha)
  } else {
    // Si no hay fecha, usar fecha actual
    fechaDate = new Date()
  }

  // Verificar que la fecha sea válida
  if (isNaN(fechaDate.getTime())) {
    fechaDate = new Date()
  }

  const opciones: Intl.DateTimeFormatOptions = {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  }

  const fechaFormateada = fechaDate.toLocaleDateString('es-ES', opciones)
  const [diaSemana, dia, mes, año] = fechaFormateada.split(', ')
  return `${diaSemana}, ${dia} de ${mes} de ${año}`
}

// Función para formatear fecha con día de la semana
function formatearFechaCompleta(
  fecha: Date | string | null | undefined
): string {
  let fechaDate: Date

  if (fecha instanceof Date) {
    fechaDate = fecha
  } else if (typeof fecha === 'string') {
    fechaDate = new Date(fecha)
  } else if (fecha) {
    fechaDate = new Date(fecha)
  } else {
    fechaDate = new Date()
  }

  if (isNaN(fechaDate.getTime())) {
    fechaDate = new Date()
  }

  const opciones: Intl.DateTimeFormatOptions = {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  }

  const fechaFormateada = fechaDate.toLocaleDateString('es-ES', opciones)
  // Dividir correctamente la fecha formateada y eliminar comas
  const partes = fechaFormateada
    .split(' ')
    .map((parte) => parte.replace(/,/g, ''))
  const diaSemana = partes[0]
  const dia = partes[1]
  const mes = partes[3]
  const año = partes[5]

  // Capitalizar la primera letra del mes
  const mesCapitalizado = mes.charAt(0).toUpperCase() + mes.slice(1)

  return `${diaSemana} ${dia} de ${mesCapitalizado} de ${año}`
}

// Función para construir la dirección completa del cliente
function construirDireccionCompleta(cliente: DealData['cliente']): string {
  if (!cliente)
    return 'DIRECCION DEL CLIENTE COMPLETA, CALLE ALTURA CIUDAD PROVINCIA COD POSTAL'

  const partes = []

  if (cliente.direccion) partes.push(cliente.direccion)
  if (cliente.ciudad) partes.push(cliente.ciudad)
  if (cliente.provincia) partes.push(cliente.provincia)
  if (cliente.codPostal) partes.push(cliente.codPostal)

  if (partes.length === 0) {
    return 'DIRECCION DEL CLIENTE COMPLETA, CALLE ALTURA CIUDAD PROVINCIA COD POSTAL'
  }

  return partes.join(', ')
}

export async function generarContratoReserva(
  deal: DealData
): Promise<Uint8Array> {
  try {
    const doc = new jsPDF()
    const pageWidth = doc.internal.pageSize.width
    const margin = 15
    let yPosition = margin - 5 // Subir logo 5px más arriba

    // Configurar fuente
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(11)

    // Logo de Seven Cars (primero)
    yPosition = await addLogoToContract(doc, yPosition)

    // Título del contrato (después del logo)
    doc.setFontSize(14)
    doc.setFont('helvetica', 'bold')
    doc.setTextColor(0, 0, 0) // Negro
    doc.text('CONTRATO DE RESERVA DE VEHÍCULO', pageWidth / 2, yPosition, {
      align: 'center',
    })
    yPosition += 8

    // Línea decorativa
    doc.setDrawColor(0, 0, 0)
    doc.setLineWidth(0.5)
    doc.line(margin, yPosition, pageWidth - margin, yPosition)
    yPosition += 18 // Separar "En Alaquàs" 10px más de la línea divisoria

    // Fecha y lugar
    doc.setFontSize(11)
    doc.setFont('helvetica', 'normal')
    doc.setTextColor(0, 0, 0) // Negro
    const fechaContrato =
      deal.fechaReservaDesde || deal.fechaCreacion || new Date()
    doc.text(
      `En Alaquàs, a ${formatearFechaCompleta(fechaContrato)}`,
      margin,
      yPosition
    )
    yPosition += 12

    // Sección "Reunidos"
    doc.setFont('helvetica', 'bold')
    doc.setTextColor(0, 0, 0) // Negro
    doc.text('Reunidos:', margin, yPosition)
    yPosition += 8

    // Parte vendedora
    doc.setFont('helvetica', 'normal')
    doc.setTextColor(0, 0, 0) // Negro
    doc.text('De una parte:', margin, yPosition)
    yPosition += 6

    const textoVendedor =
      'D. Sebastián Pelella mayor de edad, con NIE Z0147238C en representación de Seven Cars Motors, s.l.. con CIF B-75939868 y con domicilio Camí dels Mollons, 36 de Alaquàs, Valencia, en calidad de vendedores, y en adelante parte vendedora.'
    doc.text(
      doc.splitTextToSize(textoVendedor, pageWidth - margin * 2),
      margin,
      yPosition
    )
    yPosition += 15

    // Parte compradora
    doc.setTextColor(0, 0, 0) // Negro
    yPosition += 4 // Espacio adicional antes de "Y de otra parte:"
    doc.text('Y de otra parte:', margin, yPosition)
    yPosition += 6

    const nombreCompleto =
      `${deal.cliente?.nombre || ''} ${deal.cliente?.apellidos || ''}`.trim()
    const direccionCompleta = construirDireccionCompleta(deal.cliente)
    const textoComprador = `D/DÑA ${nombreCompleto || 'NOMBRE DE CLIENTE'} Mayor de edad, con DNI ${deal.cliente?.dni || 'DNI CLIENTE'} con domicilio ${direccionCompleta} en calidad de compradores, y en adelante parte compradora. Con telefono ${deal.cliente?.telefono || 'TEL CLIENTE'} y email ${deal.cliente?.email || 'EMAIL CLIENTE'}`
    doc.text(
      doc.splitTextToSize(textoComprador, pageWidth - margin * 2),
      margin,
      yPosition
    )
    yPosition += 18

    // Sección "EXPONEN"
    doc.setFont('helvetica', 'bold')
    doc.setTextColor(0, 0, 0) // Negro
    doc.text('EXPONEN', margin, yPosition)
    yPosition += 8

    // Punto 1 - Información del vehículo
    doc.setFont('helvetica', 'normal')
    doc.setTextColor(0, 0, 0) // Negro
    doc.text(
      '1. La parte vendedora es propietaria del siguiente vehículo:',
      margin,
      yPosition
    )
    yPosition += 6

    writeField(
      doc,
      'MARCA',
      deal.vehiculo?.marca || 'marca vehiculo',
      margin + 10,
      yPosition
    )
    yPosition += 7
    writeField(
      doc,
      'MODELO',
      deal.vehiculo?.modelo || 'modelo vehiculo',
      margin + 10,
      yPosition
    )
    yPosition += 7
    writeField(
      doc,
      'F.MATRICULACIÓN',
      getFechaMatriculacion(deal.vehiculo),
      margin + 10,
      yPosition
    )
    yPosition += 7
    writeField(
      doc,
      'MATRÍCULA',
      deal.vehiculo?.matricula || 'matricula vehiculo',
      margin + 10,
      yPosition
    )
    yPosition += 10

    // Punto 2 - Precio del vehículo
    const precio = deal.importeTotal || deal.vehiculo?.precioPublicacion || 0
    const precioEnLetras = numeroALetras(Math.floor(precio))

    doc.setFont('helvetica', 'normal')
    doc.text('2. El precio del vehículo indicado es: ', margin, yPosition)

    // Calcular posición del precio
    const textoInicial = '2. El precio del vehículo indicado es: '
    const anchoInicial = doc.getTextWidth(textoInicial)
    const posicionPrecio = margin + anchoInicial

    doc.setFont('helvetica', 'bold')
    doc.text(
      `${formatCurrency(precio)} (${precioEnLetras} euros)`,
      posicionPrecio,
      yPosition
    )
    yPosition += 10

    // Punto 3 - Monto de reserva
    const montoReserva = deal.importeSena || 0
    const montoReservaEnLetras = numeroALetras(Math.floor(montoReserva))

    const formaPagoReserva = getFormaPagoReserva(
      deal.formaPagoSena || 'efectivo'
    )

    // Punto 3 - Monto de reserva (usando splitTextToSize como los demás)
    const textoPunto3 = `3. Que la parte vendedora recibe de la parte compradora ${formatCurrency(montoReserva)} (${montoReservaEnLetras} euros) mediante ${formaPagoReserva} siendo este documento su más eficaz carta de pago,`

    // Dividir el texto en líneas que se ajusten al ancho de la página
    const lineasPunto3 = doc.splitTextToSize(
      textoPunto3,
      pageWidth - margin * 2
    )

    // Escribir cada línea
    doc.setFont('helvetica', 'normal')
    for (let i = 0; i < lineasPunto3.length; i++) {
      doc.text(lineasPunto3[i], margin, yPosition)
      yPosition += 4.5
    }

    yPosition += 5

    // Punto 4 - Gastos de transmisión
    doc.setFont('helvetica', 'normal')
    const textoPunto4 =
      '4. Los gastos de transmisión del vehiculo serán por cuenta de la parte vendedora. Una vez realizada la correspondiente transferencia en Tráfico, el vendedor entregará materialmente al comprador la posesión del vehículo, haciéndose el comprador cargo de cuantas responsabilidades puedan contraerse por la propiedad del vehículo y su tenencia y uso a partir de dicho momento de la entrega.'
    const lineasPunto4 = doc.splitTextToSize(
      textoPunto4,
      pageWidth - margin * 2
    )
    doc.text(lineasPunto4, margin, yPosition)
    yPosition += lineasPunto4.length * 4.5 + 5 // Espacio reducido a 5px

    // Punto 5 - Libre de cargas
    doc.setFont('helvetica', 'normal')
    const textoPunto5 =
      '5. Que el vehiculo se encuentra libre de cargas y gravámenes que pudieran impedir la formalización de la transferencia, por el adquiriente, en la Jefatura de Trafico.'
    const lineasPunto5 = doc.splitTextToSize(
      textoPunto5,
      pageWidth - margin * 2
    )
    doc.text(lineasPunto5, margin, yPosition)
    yPosition += lineasPunto5.length * 4.5 + 5 // Espacio reducido a 5px

    // Punto 6 - Plazo de pago
    doc.setFont('helvetica', 'normal')
    doc.text(
      '6. Se establece un plazo de 7 días para abonar el resto del importe indicado a la parte vendedora.',
      margin,
      yPosition
    )
    yPosition += 5 // Espacio reducido a 5px

    // Firma
    doc.setFont('helvetica', 'normal')
    doc.text('Y en prueba de conformidad, firman', margin, yPosition)
    yPosition += 15

    // Espacio para firmas
    doc.setFont('helvetica', 'normal')
    doc.text('La parte vendedora', margin, yPosition)
    doc.text('La parte compradora', pageWidth / 2 + 20, yPosition)
    yPosition += 20

    // Líneas para firmas
    doc.line(margin, yPosition, margin + 70, yPosition)
    doc.line(pageWidth / 2 + 20, yPosition, pageWidth / 2 + 90, yPosition)

    // Retornar el buffer del PDF
    const pdfBuffer = doc.output('arraybuffer')
    console.log('✅ Contrato generado exitosamente')
    return new Uint8Array(pdfBuffer)
  } catch (error) {
    console.error('❌ Error generando contrato PDF:', error)
    throw error
  }
}

// Función de fallback HTML
function generarContratoHTML(deal: DealData): void {
  const fechaContrato = deal.fechaReservaDesde || deal.fechaCreacion
  const nombreCompleto =
    `${deal.cliente?.nombre || ''} ${deal.cliente?.apellidos || ''}`.trim()
  const precio = deal.importeTotal || deal.vehiculo?.precioPublicacion || 0
  const precioEnLetras = numeroALetras(Math.floor(precio))
  const montoReserva = deal.importeSena || 0
  const montoReservaEnLetras = numeroALetras(Math.floor(montoReserva))

  const contratoHTML = `
    <!DOCTYPE html>
    <html lang="es">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Contrato de Reserva - ${deal.numero}</title>
        <style>
            body { 
                font-family: 'Times New Roman', serif; 
                font-size: 12px; 
                line-height: 1.6; 
                max-width: 800px; 
                margin: 0 auto; 
                padding: 20px; 
                background: white; 
                color: #333;
            }
            .logo { 
                text-align: center; 
                font-size: 24px; 
                font-weight: bold; 
                color: #1e40af; 
                margin-bottom: 10px; 
            }
            .linea-logo { 
                border-bottom: 2px solid #1e40af; 
                margin: 0 auto 20px auto; 
                width: 200px; 
            }
            .titulo { 
                text-align: center; 
                font-size: 18px; 
                font-weight: bold; 
                margin-bottom: 20px; 
                text-transform: uppercase; 
                letter-spacing: 1px;
            }
            .fecha { 
                margin-bottom: 20px; 
                font-weight: bold;
            }
            .seccion { 
                font-weight: bold; 
                margin: 20px 0 10px 0; 
                font-size: 14px;
            }
            .punto { 
                margin: 12px 0; 
                text-align: justify; 
                line-height: 1.8;
            }
            .indentado { 
                margin-left: 20px; 
                margin-top: 8px;
            }
            .firmas { 
                margin-top: 40px; 
                display: flex; 
                justify-content: space-between; 
            }
            .firma { 
                text-align: center; 
                width: 200px; 
            }
            .linea-firma { 
                border-bottom: 1px solid black; 
                margin-top: 40px; 
                height: 1px; 
            }
            .pie { 
                font-size: 10px; 
                text-align: center; 
                margin-top: 30px; 
                color: #666; 
            }
            .destacado {
                font-weight: bold;
                color: #1e40af;
            }
            @media print { 
                body { margin: 0; padding: 15px; } 
                .no-print { display: none; } 
            }
        </style>
    </head>
    <body>
        <div class="logo">SEVEN CARS MOTORS S.L.</div>
        <div class="linea-logo"></div>
        
        <div class="titulo">CONTRATO DE RESERVA DE VEHÍCULO</div>
        <div class="fecha">En Alaquàs, a ${formatearFechaCompleta(fechaContrato)}</div>
        
        <div class="seccion">Reunidos:</div>
        
        <div class="punto">
            <strong>De una parte:</strong><br>
            D. Sebastián Pelella mayor de edad, con NIE Z0147238C en representación de Seven Cars Motors, s.l..<br>
            con CIF B-75939868 y con domicilio Camí dels Mollons, 36 de Alaquàs, Valencia, en calidad de<br>
            vendedores, y en adelante parte vendedora.
        </div>
        
        <div class="punto">
            <strong>Y de otra parte:</strong><br><br>
            D/DÑA <strong>${nombreCompleto || 'NOMBRE DE CLIENTE'}</strong><br>
            Mayor de edad, con DNI <strong>${deal.cliente?.dni || 'DNI CLIENTE'}</strong><br>
            Con domicilio <strong>${construirDireccionCompleta(deal.cliente)}</strong><br>
            en calidad de compradores, y en adelante parte compradora.<br>
            Con telefono <strong>${deal.cliente?.telefono || 'TEL CLIENTE'}</strong><br>
            y email <strong>${deal.cliente?.email || 'EMAIL CLIENTE'}</strong>
        </div>
        
        <div class="seccion">EXPONEN</div>
        
        <div class="punto">
            <strong>1.</strong> La parte vendedora es propietaria del siguiente vehículo:<br>
            <div class="indentado">
                MARCA <strong>${deal.vehiculo?.marca || 'marca vehiculo'}</strong><br>
                MODELO <strong>${deal.vehiculo?.modelo || 'modelo vehiculo'}</strong><br>
                MATRICULA <strong>${deal.vehiculo?.matricula || 'matricula vehiculo'}</strong>
            </div>
        </div>
        
        <div class="punto">
            <strong>2.</strong> El precio del vehículo indicado es :<br>
            <div class="indentado">
                <strong>${formatCurrency(precio)} (${precioEnLetras} euros)</strong>
            </div>
        </div>
        
        <div class="punto">
            <strong>3.</strong> Que la parte vendedora recibe de la parte compradora<br>
            <div class="indentado">
                <strong>${formatCurrency(montoReserva)} (${montoReservaEnLetras} euros)</strong><br>
                mediante <strong>${getFormaPagoReserva(deal.formaPagoSena || 'efectivo')}</strong> siendo este documento su más eficaz carta de pago,
            </div>
        </div>
        
        <div class="punto">
            <strong>4.</strong> Los gastos de transmisión del vehiculo serán por cuenta de la parte vendedora. Una vez realizada la<br>
            correspondiente transferencia en Tráfico, el vendedor entregará materialmente al comprador la posesión<br>
            del vehículo, haciéndose el comprador cargo de cuantas responsabilidades puedan contraerse por la<br>
            propiedad del vehículo y su tenencia y uso a partir de dicho momento de la entrega.
        </div>
        
        <div class="punto">
            <strong>5.</strong> Que el vehiculo se encuentra libre de cargas y gravámenes que pudieran impedir la formalización<br>
            de la transferencia, por el adquiriente, en la Jefatura de Trafico.
        </div>
        
        <div class="punto">
            <strong>6.</strong> Se establece un plazo de 7 días para abonar el resto del importe indicado a la parte vendedora.
        </div>
        
        <div class="punto">
            <strong>Y en prueba de conformidad, firman</strong>
        </div>
        
        <div class="firmas">
            <div class="firma">
                La parte vendedora<br>
                <div class="linea-firma"></div>
            </div>
            <div class="firma">
                La parte compradora<br>
                <div class="linea-firma"></div>
            </div>
        </div>
        
        <div class="pie">Contrato generado el ${new Date().toLocaleDateString('es-ES')} - Deal: ${deal.numero}</div>
        <div class="no-print" style="text-align: center; margin-top: 30px;">
            <button onclick="window.print()" style="padding: 10px 20px; font-size: 14px; background: #3b82f6; color: white; border: none; border-radius: 5px; cursor: pointer;">🖨️ Imprimir Contrato</button>
        </div>
    </body>
    </html>
  `

  const ventanaContrato = window.open('', '_blank', 'width=800,height=600')
  if (ventanaContrato) {
    ventanaContrato.document.write(contratoHTML)
    ventanaContrato.document.close()
    setTimeout(() => ventanaContrato.print(), 500)
  }
}

// Función para generar contrato de venta (placeholder)
export async function generarContratoVenta(
  deal: DealData
): Promise<Uint8Array> {
  const doc = new jsPDF()
  const pageWidth = doc.internal.pageSize.getWidth()
  const pageHeight = doc.internal.pageSize.getHeight()
  const margin = 15
  let yPosition = margin - 5 // Subir logo 5px más arriba (igual que reserva)

  // Logo de Seven Cars (primero)
  yPosition = await addLogoToContract(doc, yPosition)

  // Título del contrato (después del logo)
  doc.setFontSize(14) // Reducido de 16px a 14px (igual que reserva)
  doc.setFont('helvetica', 'bold')
  doc.setTextColor(0, 0, 0)
  doc.text('CONTRATO DE VENTA DE VEHÍCULO', pageWidth / 2, yPosition, {
    align: 'center',
  })
  yPosition += 7 // Reducido de 12px a 7px (línea más cerca del título)

  // Línea decorativa
  doc.setDrawColor(0, 0, 0)
  doc.setLineWidth(0.5)
  doc.line(margin, yPosition, pageWidth - margin, yPosition)
  yPosition += 15 // Aumentado de 10px a 15px (separar "En Alaquàs" 5px más)

  // Fecha del contrato
  const fechaContrato = new Date()
  doc.setFontSize(11) // Mantener 11px (igual que reserva)
  doc.setFont('helvetica', 'normal')
  doc.text(
    `En Alaquàs, a ${formatearFechaCompleta(fechaContrato)}`,
    margin,
    yPosition
  )
  yPosition += 12

  // Datos del cliente y vehículo
  const nombreCompleto =
    `${deal.cliente?.nombre || ''} ${deal.cliente?.apellidos || ''}`.trim()
  const direccionCompleta = construirDireccionCompleta(deal.cliente)
  const precio = deal.importeTotal || deal.vehiculo?.precioPublicacion || 0
  const precioEnLetras = numeroALetras(Math.floor(precio))

  // Reunidos
  doc.setFontSize(11) // Cambiar a 11px (igual que reserva)
  doc.setFont('helvetica', 'bold')
  doc.text('Reunidos:', margin, yPosition)
  yPosition += 8

  // Parte vendedora
  doc.setFontSize(11) // Cambiar a 11px (igual que reserva)
  doc.setFont('helvetica', 'normal')
  doc.text('De una parte:', margin, yPosition)
  yPosition += 6

  const textoVendedor =
    'D. Sebastián Pelella mayor de edad, con NIE Z0147238C en representación de Seven Cars Motors, s.l.. con CIF B-75939868 y con domicilio Camí dels Mollons, 36 de Alaquàs, Valencia, en calidad de vendedores, y en adelante parte vendedora.'
  const lineasVendedor = doc.splitTextToSize(
    textoVendedor,
    pageWidth - margin * 2
  )
  doc.text(lineasVendedor, margin, yPosition)
  yPosition += lineasVendedor.length * 4.5 + 4

  // Parte compradora
  doc.text('Y de otra parte:', margin, yPosition)
  yPosition += 6

  // Datos del cliente en un párrafo continuo
  doc.setFontSize(11) // Cambiar a 11px (igual que reserva)
  const textoComprador = `D/DÑA ${nombreCompleto || 'NOMBRE DE CLIENTE'} mayor de edad, con DNI ${deal.cliente?.dni || 'DNI CLIENTE'}, con domicilio ${direccionCompleta}, con telefono ${deal.cliente?.telefono || 'TEL CLIENTE'} y email ${deal.cliente?.email || 'EMAIL CLIENTE'} en calidad de compradores, y en adelante parte compradora.`
  const lineasComprador = doc.splitTextToSize(
    textoComprador,
    pageWidth - margin * 2
  )
  doc.text(lineasComprador, margin, yPosition)
  yPosition += lineasComprador.length * 4.5 + 4

  // Acuerdo común
  doc.setFontSize(11) // Cambiar a 11px (igual que reserva)
  const textoAcuerdo =
    'Ambos de común acuerdo y reconociéndose capacidad legal para ello, formalizan la compraventa, con arreglo a las siguientes condiciones:'
  const lineasAcuerdo = doc.splitTextToSize(
    textoAcuerdo,
    pageWidth - margin * 2
  )
  doc.text(lineasAcuerdo, margin, yPosition)
  yPosition += lineasAcuerdo.length * 4.5 + 4

  // Punto 1 - Información del vehículo
  doc.setFontSize(11) // Cambiar a 11px (igual que reserva)
  const textoPunto1 =
    '1. El vendedor vende al comprador el siguiente vehículo después de comprobarlo y examinarlo a su entera conformidad, aceptando su estado, las características de uso y su fecha de matriculación:'
  const lineasPunto1 = doc.splitTextToSize(textoPunto1, pageWidth - margin * 2)
  doc.text(lineasPunto1, margin, yPosition)
  yPosition += lineasPunto1.length * 4.5 + 6

  // Datos del vehículo en formato compacto con negrita para datos dinámicos
  writeField(
    doc,
    'MARCA',
    deal.vehiculo?.marca || 'marca vehiculo',
    margin + 5,
    yPosition
  )

  writeField(
    doc,
    'MODELO',
    deal.vehiculo?.modelo || 'modelo vehiculo',
    pageWidth / 2,
    yPosition
  )

  yPosition += 4

  writeField(
    doc,
    'FECHA MATRICULACIÓN',
    getFechaMatriculacion(deal.vehiculo),
    margin + 5,
    yPosition
  )

  writeField(
    doc,
    'KMS',
    deal.vehiculo?.kms
      ? (deal.vehiculo.kms as number).toLocaleString('es-ES')
      : 'No especificados',
    pageWidth / 2,
    yPosition
  )

  yPosition += 4

  writeField(
    doc,
    'MATRICULA',
    deal.vehiculo?.matricula || 'matricula vehiculo',
    margin + 5,
    yPosition
  )

  writeField(
    doc,
    'BASTIDOR',
    deal.vehiculo?.bastidor || 'bastidor vehiculo',
    pageWidth / 2,
    yPosition
  )

  yPosition += 8

  // Precio y garantía con negrita para datos dinámicos
  doc.setFontSize(11) // Cambiar a 11px (igual que reserva)
  doc.setFont('helvetica', 'normal')
  yPosition += 5 // Bajar 5px "Por la cantidad de"
  doc.text('Por la cantidad de ', margin, yPosition)

  // Calcular posición del precio
  const textoInicial = 'Por la cantidad de '
  const anchoInicial = doc.getTextWidth(textoInicial)
  const posicionPrecio = margin + anchoInicial

  doc.setFont('helvetica', 'bold')
  doc.text(`${formatCurrency(precio)}`, posicionPrecio, yPosition)

  // Calcular posición del texto en paréntesis
  const anchoPrecio = doc.getTextWidth(formatCurrency(precio))
  const posicionParentesis = posicionPrecio + anchoPrecio

  doc.setFont('helvetica', 'normal')
  doc.text(' (', posicionParentesis, yPosition)

  // Calcular posición del texto en letras
  const anchoParentesis = doc.getTextWidth(' (')
  const posicionLetras = posicionParentesis + anchoParentesis

  doc.setFont('helvetica', 'bold')
  doc.text(`${precioEnLetras} euros`, posicionLetras, yPosition)

  // Calcular posición del texto final
  const anchoLetras = doc.getTextWidth(`${precioEnLetras} euros`)
  const posicionFinal = posicionLetras + anchoLetras

  doc.setFont('helvetica', 'normal')
  doc.text(') - Garantizado por 12 Meses', posicionFinal, yPosition)
  yPosition += 10

  // Sección ENTREGA DE VEHÍCULO
  doc.setFontSize(11) // Cambiar a 11px (igual que reserva)
  doc.setFont('helvetica', 'bold')
  doc.text('ENTREGA DE VEHÍCULO', margin, yPosition)
  yPosition += 11 // Aumentado de 6px a 11px (bajar 5px)

  // Punto 2 - Entrega de vehículo
  doc.setFontSize(11) // Cambiar a 11px (igual que reserva)
  doc.setFont('helvetica', 'normal')
  const textoPunto2 =
    '2. El vendedor entrega al comprador, las llaves del vehículo, el permiso de circulación, ficha técnica, el manual y recibe la documentación indicada en este acto'
  const lineasPunto2 = doc.splitTextToSize(textoPunto2, pageWidth - margin * 2)
  doc.text(lineasPunto2, margin, yPosition)
  yPosition += lineasPunto2.length * 4.5 + 8

  // Punto 3 - Responsabilidad de reparaciones
  doc.setFontSize(11) // Cambiar a 11px (igual que reserva)
  yPosition -= 3 // Subir 3px el punto 3
  const textoPunto3 =
    '3. El vendedor no se responsabilizara si el comprador reparase el vehículo por su cuenta, sin que el vendedor hubiera dado su autorización, determinando el taller y manera de llevar a cabo la reparación.'
  const lineasPunto3 = doc.splitTextToSize(textoPunto3, pageWidth - margin * 2)
  doc.text(lineasPunto3, margin, yPosition)
  yPosition += lineasPunto3.length * 4.5 + 10

  // Segunda llave con checkboxes
  doc.setFontSize(11) // Cambiar a 11px (igual que reserva)
  doc.text('SEGUNDA LLAVE', margin, yPosition)
  yPosition += 6

  // Checkbox Entregada
  doc.rect(margin + 5, yPosition - 2, 4, 4)
  doc.text('Entregada', margin + 15, yPosition)

  // Checkbox Pendiente
  doc.rect(margin + 50, yPosition - 2, 4, 4)
  doc.text('Pendiente', margin + 60, yPosition)
  yPosition += 15

  // Espacio adicional antes de la firma
  yPosition += 8

  // Firma
  doc.setFontSize(11) // Cambiar a 11px (igual que reserva)
  yPosition -= 10 // Subir 10px "Y en prueba de conformidad, firman" (antes 15px, ahora 5px menos)
  doc.text('Y en prueba de conformidad, firman', margin, yPosition)
  yPosition += 12

  // Firmas
  doc.setFontSize(11) // Cambiar a 11px (igual que reserva)
  yPosition -= 5 // Subir 5px las líneas de firma
  yPosition += 5 // Bajar 5px "La parte vendedora" y "La parte compradora"
  doc.text('La parte vendedora', margin, yPosition)
  doc.text('La parte compradora', pageWidth / 2 + 10, yPosition)
  yPosition += 15 // Achicar 5px la distancia de las líneas de firma (antes 20px, ahora 15px)

  // Líneas para firmas
  doc.line(margin, yPosition, margin + 70, yPosition)
  doc.line(pageWidth / 2 + 10, yPosition, pageWidth / 2 + 80, yPosition)

  // Retornar el buffer del PDF
  const pdfBuffer = doc.output('arraybuffer')
  return new Uint8Array(pdfBuffer)
}

// Función para generar factura
// Función para generar factura profesional
export async function generarFactura(
  deal: DealData,
  tipoFactura: 'IVA' | 'REBU' = 'IVA',
  numeroFacturaPersonalizado?: string
): Promise<Uint8Array> {
  console.log('🔍 [GENERAR FACTURA] Parámetros recibidos:', {
    tipoFactura,
    numeroFacturaPersonalizado,
    dealId: (deal as any).id,
  })

  try {
    console.log('🔍 [GENERAR FACTURA] Creando instancia de jsPDF...')
    const doc = new jsPDF()
    console.log('✅ [GENERAR FACTURA] jsPDF creado exitosamente')
    const pageWidth = doc.internal.pageSize.getWidth()
    const pageHeight = doc.internal.pageSize.getHeight()
    const margin = 15
    let yPosition = margin - 5 // Subir logo 5px más arriba (igual que reserva)

    // Generar número de factura
    const numeroFactura =
      numeroFacturaPersonalizado ||
      `FAC-${new Date().getFullYear()}-${String((deal as any).id || Math.floor(Math.random() * 1000)).padStart(4, '0')}`
    const fechaFactura = new Date()

    // Logo de Seven Cars (centrado)
    yPosition = await addLogoToContract(doc, yPosition)

    // Mover yPosition después del logo
    yPosition -= 5 // Subir 20px el texto (15px - 20px = -5px)

    // Datos de la empresa (debajo del logo, centrados)
    doc.setFontSize(8)
    doc.setFont('helvetica', 'normal')
    doc.text('Seven Cars Motors S.L.', pageWidth / 2, yPosition, {
      align: 'center',
    })
    yPosition += 3
    doc.text('CIF: B-75939868', pageWidth / 2, yPosition, { align: 'center' })
    yPosition += 3
    doc.text('Camí els Mollons, 36', pageWidth / 2, yPosition, {
      align: 'center',
    })
    yPosition += 3
    doc.text('46970 Alaquàs, Valencia', pageWidth / 2, yPosition, {
      align: 'center',
    })
    yPosition += 30 // Sumar 20px de margen inferior (antes 10px, ahora 30px)

    // Número de factura (debajo del logo)
    doc.setFontSize(10)
    doc.setFont('helvetica', 'normal')
    writeField(doc, 'Nº Factura', numeroFactura, margin, yPosition)
    yPosition += 5

    // Fecha (debajo del número de factura)
    writeField(
      doc,
      'Fecha',
      fechaFactura.toLocaleDateString('es-ES'),
      margin,
      yPosition
    )
    yPosition += 15

    // Título de la factura (más abajo)
    doc.setFontSize(16)
    doc.setFont('helvetica', 'bold')
    doc.text(
      tipoFactura === 'IVA' ? 'FACTURA' : 'FACTURA REBU',
      pageWidth / 2,
      yPosition,
      { align: 'center' }
    )
    yPosition += 15

    // Línea separadora
    doc.setDrawColor(0, 0, 0)
    doc.setLineWidth(0.5)
    doc.line(margin, yPosition, pageWidth - margin, yPosition)
    yPosition += 10

    // Datos del cliente
    doc.setFontSize(10)
    doc.setFont('helvetica', 'bold')
    doc.text('FACTURAR A:', margin, yPosition)
    yPosition += 6

    doc.setFont('helvetica', 'normal')
    doc.text(
      `${deal.cliente?.nombre || 'No especificado'} ${deal.cliente?.apellidos || ''}`,
      margin,
      yPosition
    )
    yPosition += 4
    writeField(
      doc,
      'DNI',
      deal.cliente?.dni || 'No especificado',
      margin,
      yPosition
    )
    yPosition += 4
    writeField(
      doc,
      'Teléfono',
      deal.cliente?.telefono || 'No especificado',
      margin,
      yPosition
    )
    yPosition += 4
    writeField(
      doc,
      'Email',
      deal.cliente?.email || 'No especificado',
      margin,
      yPosition
    )
    yPosition += 10

    // Tabla de conceptos
    const totalConIva = deal.importeTotal || 0

    // Cálculo correcto del IVA: el total incluye IVA, calcular subtotal e IVA
    console.log(
      '🔍 [CALCULO IVA] tipoFactura recibido:',
      tipoFactura,
      'tipoFactura === "IVA":',
      tipoFactura === 'IVA'
    )
    let subtotal, iva, total
    if (tipoFactura === 'IVA') {
      // Si el total incluye IVA, calcular el subtotal dividiendo por 1.21
      subtotal = totalConIva / 1.21
      iva = totalConIva - subtotal
      total = totalConIva
    } else {
      // REBU: sin IVA
      subtotal = totalConIva
      iva = 0
      total = totalConIva
    }

    console.log('🔍 [CALCULO IVA] Valores calculados:', {
      tipoFactura,
      subtotal,
      iva,
      total,
      totalConIva,
    })

    // Encabezados de tabla (sin cantidad)
    doc.setFontSize(9)
    doc.setFont('helvetica', 'bold')
    doc.text('CONCEPTO', margin, yPosition)
    doc.text('PRECIO', margin + 120, yPosition)
    doc.text('TOTAL', margin + 160, yPosition)
    yPosition += 5

    // Línea de encabezados
    doc.line(margin, yPosition, pageWidth - margin, yPosition)
    yPosition += 5

    // Concepto principal
    doc.setFont('helvetica', 'normal')
    const concepto = `Venta de vehículo: ${deal.vehiculo?.marca || 'No especificada'} ${deal.vehiculo?.modelo || 'No especificado'}`
    const conceptoLineas = doc.splitTextToSize(concepto, 100)
    doc.text(conceptoLineas, margin, yPosition)

    // Detalles adicionales del vehículo
    doc.text(
      `Matrícula: ${deal.vehiculo?.matricula || 'No especificada'}`,
      margin,
      yPosition + 8
    )
    doc.text(
      `Fecha de Matriculación: ${getFechaMatriculacion(deal.vehiculo)}`,
      margin,
      yPosition + 12
    )
    doc.text(
      `Kms: ${deal.vehiculo?.kms ? (deal.vehiculo.kms as number).toLocaleString('es-ES') : 'No especificados'}`,
      margin,
      yPosition + 16
    )
    doc.text(
      `Bastidor: ${deal.vehiculo?.bastidor || 'No especificado'}`,
      margin,
      yPosition + 20
    )

    // Datos de la tabla (sin cantidad) - ajustar posición para no superponerse con detalles
    // Para REBU mostrar el precio total directamente, para IVA mostrar subtotal
    const precioMostrar = tipoFactura === 'REBU' ? total : subtotal
    doc.text(formatCurrency(precioMostrar), margin + 120, yPosition + 20)
    doc.text(formatCurrency(total), margin + 160, yPosition + 20)
    yPosition += 30

    // Línea de totales
    doc.line(margin, yPosition, pageWidth - margin, yPosition)
    yPosition += 5

    // Totales
    doc.setFont('helvetica', 'bold')

    if (tipoFactura === 'REBU') {
      // REBU: Solo mostrar el total, sin desglosar IVA
      doc.text('TOTAL:', margin + 120, yPosition)
      doc.text(formatCurrency(total), margin + 160, yPosition)
      yPosition += 5
    } else {
      // IVA: Mostrar subtotal e IVA por separado
      doc.text('SUBTOTAL:', margin + 120, yPosition)
      doc.text(formatCurrency(subtotal), margin + 160, yPosition)
      yPosition += 5

      doc.text('IVA (21%):', margin + 120, yPosition)
      doc.text(formatCurrency(iva), margin + 160, yPosition)
      yPosition += 5
    }

    // Línea de total final (solo para IVA, REBU ya tiene su total arriba)
    if (tipoFactura === 'IVA') {
      doc.setLineWidth(1)
      doc.line(margin + 120, yPosition, pageWidth - margin, yPosition)
      yPosition += 5

      doc.setFontSize(12)
      doc.text('TOTAL:', margin + 120, yPosition)
      doc.text(formatCurrency(total), margin + 160, yPosition)
      yPosition += 15
    } else {
      // Para REBU, solo agregar espacio
      yPosition += 15
    }

    // Información adicional
    doc.setFontSize(8)
    doc.setFont('helvetica', 'normal')
    if (tipoFactura === 'REBU') {
      doc.text('Régimen Especial Básico - Sin IVA', margin, yPosition)
    } else {
      doc.text('IVA incluido', margin, yPosition)
    }
    yPosition += 5
    doc.text('Garantía: 12 meses', margin, yPosition)

    // Disclaimers legales
    yPosition += 10
    doc.setFontSize(7)
    doc.setFont('helvetica', 'normal')

    // Cláusula de privacidad
    doc.text('1) CLÁUSULA DE PRIVACIDAD', margin, yPosition)
    yPosition += 4
    doc.text(
      'Responsable tratamiento: Datos indicados en factura | Los datos personales que nos facilitas los tratamos con el fin de prestarte el servicio solicitado y facturarlo. Los datos los trataremos mientras manteng Si consideras que no hemos satisfecho tu petición, puedes presentar una reclamación a la Agencia Española de Protección de Datos en https://www.aepd.es/',
      margin,
      yPosition,
      { maxWidth: pageWidth - 2 * margin }
    )
    yPosition += 8

    // Registro mercantil
    doc.text(
      '2) Registro Mercantil de Valencia 25/02/2025, en el FOLIO ELECTRÓNICO, inscripción 1 con hoja V-223873.',
      margin,
      yPosition,
      { maxWidth: pageWidth - 2 * margin }
    )
    yPosition += 10

    // Pie de página
    yPosition = pageHeight - 30
    doc.setFontSize(8)
    doc.text('Gracias por su confianza', pageWidth / 2, yPosition, {
      align: 'center',
    })
    yPosition += 4
    doc.text(
      'Seven Cars Motors S.L. - CIF: B-75939868',
      pageWidth / 2,
      yPosition,
      { align: 'center' }
    )

    // Retornar el buffer del PDF
    console.log('🔍 [GENERAR FACTURA] Generando buffer del PDF...')
    const pdfBuffer = doc.output('arraybuffer')
    console.log(
      '✅ [GENERAR FACTURA] Buffer generado, tamaño:',
      pdfBuffer.byteLength,
      'bytes'
    )
    return new Uint8Array(pdfBuffer)
  } catch (error) {
    console.error('❌ [GENERAR FACTURA] Error generando factura:', error)
    console.error('❌ [GENERAR FACTURA] Stack trace:', (error as Error).stack)
    throw error
  }
}

// Interface para datos del depósito
interface DepositoData {
  id: number
  cliente: {
    nombre: string
    apellidos: string
    dni?: string
    direccion?: string
    ciudad?: string
    provincia?: string
    codPostal?: string
  }
  vehiculo: {
    marca: string
    modelo: string
    bastidor: string
    matricula: string
    fechaMatriculacion?: string
    kms?: number
  }
  deposito: {
    monto_recibir?: number
    dias_gestion?: number
    multa_retiro_anticipado?: number
    numero_cuenta?: string
  }
}

// Función para generar contrato de compraventa simplificado (solo cliente y vehículo)
export async function generarContratoCompraventaSimple(
  cliente: any,
  vehiculo: any,
  precio: number
): Promise<Uint8Array> {
  try {
    const doc = new jsPDF()
    const pageWidth = doc.internal.pageSize.width
    const margin = 10
    const maxWidth = pageWidth - margin * 2
    let yPosition = margin

    // Configurar fuente
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(10)

    // Logo de Seven Cars (primero)
    yPosition = await addLogoToContract(doc, yPosition)

    // Título del contrato
    doc.setFontSize(14)
    doc.setFont('helvetica', 'bold')
    doc.setTextColor(0, 0, 0)
    doc.text(
      'CONTRATO DE COMPRAVENTA DE VEHÍCULO USADO',
      pageWidth / 2,
      yPosition,
      { align: 'center' }
    )
    yPosition += 12

    // Fecha y hora actual
    const ahora = new Date()
    const dia = ahora.getDate()
    const mes = ahora.toLocaleDateString('es-ES', { month: 'long' })
    const año = ahora.getFullYear()
    const hora = ahora.getHours().toString().padStart(2, '0')
    const minutos = ahora.getMinutes().toString().padStart(2, '0')

    // Capitalizar la primera letra del mes
    const mesCapitalizado = mes.charAt(0).toUpperCase() + mes.slice(1)

    doc.setFontSize(10)
    doc.setFont('helvetica', 'normal')
    doc.text(
      `En Alaquas, a ${dia} de ${mesCapitalizado} de ${año}, a las ${hora}:${minutos} Hs.`,
      margin,
      yPosition
    )
    yPosition += 12

    // REUNIDOS
    doc.setFontSize(11)
    doc.setFont('helvetica', 'bold')
    doc.text('REUNIDOS', margin, yPosition)
    yPosition += 8

    // De una parte
    doc.setFont('helvetica', 'bold')
    doc.text('DE UNA PARTE:', margin, yPosition)
    yPosition += 6

    doc.setFont('helvetica', 'normal')
    doc.text(
      'D. Sebastian Pelella, mayor de edad, con NIE Z0147238C, en representación de Sevencars Motors SL',
      margin,
      yPosition
    )
    yPosition += 5
    doc.text(
      'con CIF B75939868 y domicilio en Cami dels Mollons Nº 36 Bajo de Alaquas, Valencia,',
      margin,
      yPosition
    )
    yPosition += 5
    doc.text('en calidad de adquiriente o comprador.', margin, yPosition)
    yPosition += 8

    // Y DE OTRA PARTE
    doc.setFont('helvetica', 'bold')
    doc.text('Y DE OTRA PARTE:', margin, yPosition)
    yPosition += 6
    doc.setFont('helvetica', 'normal')
    const nombreCompleto = `${capitalizeText(cliente.nombre)} ${capitalizeText(cliente.apellidos)}`
    const direccionCompleta =
      `${cliente.direccion || ''}, ${cliente.ciudad || ''}, ${cliente.provincia || ''}`
        .trim()
        .replace(/^,\s*|,\s*$/g, '') // Eliminar comas al inicio y final

    const textoCliente = `D/Dña ${nombreCompleto}, mayor de edad, con DNI ${cliente.dni}, con domicilio en ${direccionCompleta || 'No especificado'}, en calidad de vendedor.`
    const linesCliente = doc.splitTextToSize(textoCliente, maxWidth)
    doc.text(linesCliente, margin, yPosition)
    yPosition += linesCliente.length * 5 + 8

    // Manifiestan
    doc.setFont('helvetica', 'bold')
    doc.text('MANIFIESTAN:', margin, yPosition)
    yPosition += 8

    // Clausula 1
    const clausula1 = `1. Que EL VENDEDOR es el propietario del vehículo que se describe a continuación:`
    doc.setFont('helvetica', 'normal')
    doc.text(clausula1, margin, yPosition)
    yPosition += 8

    // Dos columnas para los datos del vehículo (igual que contrato original)
    const col1X = margin + 8
    const col2X = margin + 90
    const lineHeight = 5

    // Columna izquierda
    doc.text(`Marca y Modelo: `, col1X, yPosition)
    doc.setFont('helvetica', 'bold')
    doc.text(
      `${capitalizeText(vehiculo.marca)} ${capitalizeText(vehiculo.modelo)}`,
      col1X + 35,
      yPosition
    )
    doc.setFont('helvetica', 'normal')
    doc.text(`Nº Bastidor: `, col1X, yPosition + lineHeight)
    doc.setFont('helvetica', 'bold')
    doc.text(
      `${vehiculo.bastidor || 'No especificado'}`,
      col1X + 35,
      yPosition + lineHeight
    )
    doc.setFont('helvetica', 'normal')
    doc.text(`Matrícula: `, col1X, yPosition + lineHeight * 2)
    doc.setFont('helvetica', 'bold')
    doc.text(`${vehiculo.matricula}`, col1X + 35, yPosition + lineHeight * 2)
    doc.setFont('helvetica', 'normal')

    // Columna derecha
    doc.text(`Fecha 1ª Matriculación: `, col2X, yPosition)
    doc.setFont('helvetica', 'bold')
    doc.text(
      `${vehiculo.fechaMatriculacion ? new Date(vehiculo.fechaMatriculacion).toLocaleDateString('es-ES') : 'No especificada'}`,
      col2X + 50,
      yPosition
    )
    doc.setFont('helvetica', 'normal')
    doc.text(`Kilometraje: `, col2X, yPosition + lineHeight)
    doc.setFont('helvetica', 'bold')
    doc.text(
      `${vehiculo.kms ? vehiculo.kms.toLocaleString('es-ES') : 'No especificado'} km`,
      col2X + 50,
      yPosition + lineHeight
    )
    doc.setFont('helvetica', 'normal')
    doc.text(`Color: `, col2X, yPosition + lineHeight * 2)
    doc.setFont('helvetica', 'bold')
    doc.text(
      `${vehiculo.color || 'No especificado'}`,
      col2X + 50,
      yPosition + lineHeight * 2
    )
    doc.setFont('helvetica', 'normal')

    yPosition += lineHeight * 3 + 6

    // Clausula 2
    const clausula2 = `2. Que EL COMPRADOR desea adquirir el vehículo descrito en las condiciones que se establecen en el presente contrato.`
    const lines2 = doc.splitTextToSize(clausula2, maxWidth)
    doc.text(lines2, margin, yPosition)
    yPosition += lines2.length * 5 + 5

    // Clausula 3
    const clausula3 = `3. Que EL VENDEDOR garantiza ser el legítimo propietario del vehículo y que el mismo se encuentra libre de cargas, embargos, hipotecas o cualquier otro gravamen que pueda afectar a su propiedad.`
    const lines3 = doc.splitTextToSize(clausula3, maxWidth)
    doc.text(lines3, margin, yPosition)
    yPosition += lines3.length * 5 + 5

    // Clausula 4
    const clausula4 = `4. Que EL VENDEDOR declara que el vehículo se encuentra en el estado que corresponde a su antigüedad y kilometraje, habiendo sido informado EL COMPRADOR de todas las características y condiciones del mismo.`
    const lines4 = doc.splitTextToSize(clausula4, maxWidth)
    doc.text(lines4, margin, yPosition)
    yPosition += lines4.length * 5 + 5

    // Clausula 5 - Precio
    const monto = precio || 0
    const montoEnLetras = numeroALetras(monto)
    const clausula5 = `5. El precio de la compra-venta se fija en ${formatCurrency(monto)} (${montoEnLetras} euros) impuestos incluidos (REBU, régimen Especial de Bienes Usados) que se abonan en este momento sirviendo el presente documento como carta de pago.`
    const lines5 = doc.splitTextToSize(clausula5, maxWidth - 10)

    // Procesar cada línea para poner en negrita solo el precio
    let currentY = yPosition
    for (let i = 0; i < lines5.length; i++) {
      const line = lines5[i]

      // Buscar el precio completo con paréntesis en la línea
      const precioMatch = line.match(/(\d+\.\d+€\s*\(\w+\s+\w+\s+\w+\))/)
      if (precioMatch) {
        const beforePrecio = line.substring(0, line.indexOf(precioMatch[0]))
        const precioCompleto = precioMatch[0]
        const afterPrecio = line.substring(
          line.indexOf(precioMatch[0]) + precioCompleto.length
        )

        // Escribir texto antes del precio
        if (beforePrecio) {
          doc.setFont('helvetica', 'normal')
          doc.text(beforePrecio, margin, currentY)
        }

        // Escribir precio en negrita
        doc.setFont('helvetica', 'bold')
        doc.text(
          precioCompleto,
          margin + (beforePrecio ? doc.getTextWidth(beforePrecio) : 0),
          currentY
        )

        // Escribir texto después del precio
        if (afterPrecio) {
          doc.setFont('helvetica', 'normal')
          doc.text(
            afterPrecio,
            margin +
              (beforePrecio ? doc.getTextWidth(beforePrecio) : 0) +
              doc.getTextWidth(precioCompleto),
            currentY
          )
        }
      } else {
        // Si no hay precio en esta línea, escribirla normal
        doc.setFont('helvetica', 'normal')
        doc.text(line, margin, currentY)
      }
      currentY += 5
    }
    yPosition = currentY + 5

    // Clausula 6
    const clausula6 = `6. Que con la firma del presente contrato, EL VENDEDOR entrega y EL COMPRADOR recibe el vehículo descrito, así como toda la documentación del mismo (permiso de circulación, ficha técnica, etc.).`
    const lines6 = doc.splitTextToSize(clausula6, maxWidth)
    doc.text(lines6, margin, yPosition)
    yPosition += lines6.length * 5 + 5

    // Clausula 7
    const clausula7 = `7. Que EL COMPRADOR se compromete a realizar el cambio de titularidad del vehículo en el plazo máximo de 30 días naturales desde la fecha de firma del presente contrato.`
    const lines7 = doc.splitTextToSize(clausula7, maxWidth)
    doc.text(lines7, margin, yPosition)
    yPosition += lines7.length * 5 + 5

    // Clausula 8
    const clausula8 = `8. Que las partes se someten expresamente a la jurisdicción de los Juzgados y Tribunales de Valencia para la resolución de cualquier controversia que pueda surgir en relación con el presente contrato.`
    const lines8 = doc.splitTextToSize(clausula8, maxWidth)
    doc.text(lines8, margin, yPosition)
    yPosition += lines8.length * 5 + 8

    // Firma
    doc.setFont('helvetica', 'bold')
    doc.text(
      'Y en prueba de conformidad, firman el presente contrato por duplicado y a un solo efecto:',
      margin,
      yPosition
    )
    yPosition += 15

    // Líneas de firma
    doc.setFont('helvetica', 'normal')
    doc.text('EL COMPRADOR', margin, yPosition)
    doc.text('EL VENDEDOR', pageWidth / 2 + 20, yPosition)
    yPosition += 25

    doc.text('_________________________', margin, yPosition)
    doc.text('_________________________', pageWidth / 2 + 20, yPosition)
    yPosition += 8

    doc.text('SEVEN CARS MOTORS S.L.', margin, yPosition)
    doc.text(
      `${capitalizeText(cliente.nombre)} ${capitalizeText(cliente.apellidos)}`,
      pageWidth / 2 + 20,
      yPosition
    )

    return new Uint8Array(doc.output('arraybuffer'))
  } catch (error) {
    console.error('Error generando contrato de compraventa:', error)
    throw error
  }
}

// Función para generar contrato de compraventa (versión original para depósitos)
export async function generarContratoCompraventa(
  deposito: DepositoData
): Promise<Uint8Array> {
  try {
    const doc = new jsPDF()
    const pageWidth = doc.internal.pageSize.width
    const margin = 10
    const maxWidth = pageWidth - margin * 2
    let yPosition = margin

    // Configurar fuente
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(10)

    // Logo de Seven Cars (primero)
    yPosition = await addLogoToContract(doc, yPosition)

    // Título del contrato
    doc.setFontSize(14)
    doc.setFont('helvetica', 'bold')
    doc.setTextColor(0, 0, 0)
    doc.text(
      'CONTRATO DE COMPRAVENTA DE VEHÍCULO USADO',
      pageWidth / 2,
      yPosition,
      { align: 'center' }
    )
    yPosition += 12

    // Fecha y hora actual
    const ahora = new Date()
    const dia = ahora.getDate()
    const mes = ahora.toLocaleDateString('es-ES', { month: 'long' })
    const año = ahora.getFullYear()
    const hora = ahora.getHours().toString().padStart(2, '0')
    const minutos = ahora.getMinutes().toString().padStart(2, '0')

    // Capitalizar la primera letra del mes
    const mesCapitalizado = mes.charAt(0).toUpperCase() + mes.slice(1)

    doc.setFontSize(10)
    doc.setFont('helvetica', 'normal')
    doc.text(
      `En Alaquas, a ${dia} de ${mesCapitalizado} de ${año}, a las ${hora}:${minutos} Hs.`,
      margin,
      yPosition
    )
    yPosition += 12

    // REUNIDOS
    doc.setFontSize(11)
    doc.setFont('helvetica', 'bold')
    doc.text('REUNIDOS', margin, yPosition)
    yPosition += 8

    // DE UNA PARTE
    doc.setFont('helvetica', 'bold')
    doc.text('DE UNA PARTE:', margin, yPosition)
    yPosition += 6
    doc.setFont('helvetica', 'normal')
    doc.text(
      'D. Sebastian Pelella, mayor de edad, con NIE Z0147238C, en representación de Sevencars Motors SL',
      margin,
      yPosition
    )
    yPosition += 5
    doc.text(
      'con CIF B75939868 y domicilio en Cami dels Mollons Nº 36 Bajo de Alaquas, Valencia,',
      margin,
      yPosition
    )
    yPosition += 5
    doc.text('en calidad de adquiriente o comprador.', margin, yPosition)
    yPosition += 8

    // Y DE OTRA PARTE
    doc.setFont('helvetica', 'bold')
    doc.text('Y DE OTRA PARTE:', margin, yPosition)
    yPosition += 6
    doc.setFont('helvetica', 'normal')
    const nombreCompleto = `${deposito.cliente.nombre} ${deposito.cliente.apellidos}`
    const direccionCompleta =
      `${deposito.cliente.direccion || ''}, ${deposito.cliente.ciudad || ''}, ${deposito.cliente.provincia || ''}`
        .trim()
        .replace(/^,\s*|,\s*$/g, '')
    const textoVendedor = `D.${nombreCompleto}, mayor de edad, con DNI ${deposito.cliente.dni || 'No especificado'}, con domicilio en ${direccionCompleta || 'No especificado'}, en calidad de trasmitente o vendedor.`
    const lineasVendedor = doc.splitTextToSize(textoVendedor, maxWidth)
    doc.text(lineasVendedor, margin, yPosition)
    yPosition += lineasVendedor.length * 5 + 4

    const textoAcuerdo =
      'Ambas partes tienen y se reconocen la capacidad legal necesaria para otorgar el presente documento privado CONTRATO DE COMPRAVENTA del vehículo automóvil que se especifica, en las siguientes cláusulas:'
    const lineasAcuerdo = doc.splitTextToSize(textoAcuerdo, maxWidth)
    doc.text(lineasAcuerdo, margin, yPosition)
    yPosition += lineasAcuerdo.length * 5 + 4

    // Clausula 1
    doc.setFont('helvetica', 'normal')
    doc.text(
      '1. Que las características básicas del vehículo usado objeto de este documento son las siguientes:',
      margin,
      yPosition
    )
    yPosition += 6

    // Dos columnas para los datos del vehículo
    const col1X = margin + 8
    const col2X = margin + 90
    const lineHeight = 5

    // Columna izquierda
    doc.text(`Marca y Modelo: `, col1X, yPosition)
    doc.setFont('helvetica', 'bold')
    doc.text(
      `${capitalizeText(deposito.vehiculo.marca)} ${capitalizeText(deposito.vehiculo.modelo)}`,
      col1X + 35,
      yPosition
    )
    doc.setFont('helvetica', 'normal')
    doc.text(`Nº Bastidor: `, col1X, yPosition + lineHeight)
    doc.setFont('helvetica', 'bold')
    doc.text(
      `${deposito.vehiculo.bastidor}`,
      col1X + 35,
      yPosition + lineHeight
    )
    doc.setFont('helvetica', 'normal')
    doc.text(`Matrícula: `, col1X, yPosition + lineHeight * 2)
    doc.setFont('helvetica', 'bold')
    doc.text(
      `${deposito.vehiculo.matricula}`,
      col1X + 35,
      yPosition + lineHeight * 2
    )
    doc.setFont('helvetica', 'normal')

    // Columna derecha
    doc.text(`Fecha 1ª Matriculación: `, col2X, yPosition)
    doc.setFont('helvetica', 'bold')
    doc.text(
      `${deposito.vehiculo.fechaMatriculacion ? new Date(deposito.vehiculo.fechaMatriculacion).toLocaleDateString('es-ES') : 'No especificada'}`,
      col2X + 50,
      yPosition
    )
    doc.setFont('helvetica', 'normal')
    doc.text(`Kilometraje: `, col2X, yPosition + lineHeight)
    doc.setFont('helvetica', 'bold')
    doc.text(
      `${deposito.vehiculo.kms ? deposito.vehiculo.kms.toLocaleString('es-ES') : 'No especificado'} km`,
      col2X + 50,
      yPosition + lineHeight
    )
    doc.setFont('helvetica', 'normal')

    yPosition += lineHeight * 3 + 6

    // Clausula 2
    const clausula2 =
      '2. El vendedor es el actual y único titular del vehiculo, y declara que no pesa sobre el vehículo ninguna carga o gravamen ni impuesto, deuda o sanción pendientes de abono en la fecha de la firma de este contrato, comprometiéndose en caso contrario a regularizar tal situación a su exclusivo cargo. En caso de que no se pudiese tramitar el cambio de nombre se resolvería el contrato y devolverían las cantidades abonadas.'
    const lines2 = doc.splitTextToSize(clausula2, maxWidth)
    doc.text(lines2, margin, yPosition)
    yPosition += lines2.length * 5 + 5

    // Clausula 3
    const clausula3 =
      '3. El vendedor se compromete a facilitar los distintos documentos relativos al vehículo, así como a firmar cuantos documentos aparte de éste sean necesarios para que el vehículo quede correctamente inscrito a nombre del comprador en los correspondientes organismos públicos, siendo todos los gastos a cargo del comprador. Ambas partes acuerdan dar cumplimiento a lo establecido en los artículos 32 y 33 del Reglamento General de Vehículos.'
    const lines3 = doc.splitTextToSize(clausula3, maxWidth)
    doc.text(lines3, margin, yPosition)
    yPosition += lines3.length * 5 + 5

    // Clausula 4
    const clausula4 =
      '4. El vendedor declara que no existen vicios ocultos o que tengan su origen en dolo o mala fe.'
    const lines4 = doc.splitTextToSize(clausula4, maxWidth)
    doc.text(lines4, margin, yPosition)
    yPosition += lines4.length * 5 + 5

    // Clausula 5
    const monto = deposito.deposito.monto_recibir || 0
    const montoEnLetras = numeroALetras(monto)
    const clausula5 = `5. El precio de la compra-venta se fija en${formatCurrency(monto)} (${montoEnLetras} euros) impuestos incluidos (REBU, régimen Especial de Bienes Usados) que se abonan en este momento sirviendo el presente documento como carta de pago. Se abonan en la cuenta indicada por el vendedor ${deposito.deposito.numero_cuenta || 'No especificado'}.`
    const lines5 = doc.splitTextToSize(clausula5, maxWidth - 10) // Reducir margen derecho

    // Procesar cada línea para poner en negrita solo el precio
    let currentY = yPosition
    for (let i = 0; i < lines5.length; i++) {
      const line = lines5[i]

      // Buscar el precio completo con paréntesis en la línea
      const precioMatch = line.match(/(\d+\.\d+€\s*\(\w+\s+\w+\s+\w+\))/)
      if (precioMatch) {
        const beforePrecio = line.substring(0, line.indexOf(precioMatch[0]))
        const precioCompleto = precioMatch[0]
        const afterPrecio = line.substring(
          line.indexOf(precioMatch[0]) + precioCompleto.length
        )

        // Escribir texto antes del precio
        if (beforePrecio) {
          doc.text(beforePrecio, margin, currentY)
        }

        // Escribir precio completo en texto normal con espaciado específico
        doc.setFont('helvetica', 'normal')
        const espacioAntes = beforePrecio
          ? doc.getTextWidth(beforePrecio) + 3
          : 0 // 3px de separación del lado izquierdo
        doc.text(precioCompleto, margin + espacioAntes, currentY)

        // Escribir texto después del precio con espaciado específico
        if (afterPrecio) {
          const espacioDespues = 2 // 2px de separación del lado derecho para "euros)"
          doc.text(
            afterPrecio,
            margin +
              espacioAntes +
              doc.getTextWidth(precioCompleto) +
              espacioDespues,
            currentY
          )
        }
      } else {
        // Línea normal sin precio
        doc.text(line, margin, currentY)
      }

      currentY += 5
    }

    yPosition = currentY + 5

    // Clausula 6
    const clausula6 =
      '6. Para cualquier litigio que surja entre las partes de la interpretación o cumplimiento del presente contrato, éstas, con expresa renuncia al fuero que pudiera corresponderles, se someterán a los Juzgados y Tribunales de Valencia.'
    const lines6 = doc.splitTextToSize(clausula6, maxWidth)
    doc.text(lines6, margin, yPosition)
    yPosition += lines6.length * 5 + 5

    // Firma
    const firma =
      'Y para que así conste, firman el presente contrato de compraventa, por duplicado, en la fecha y lugar arriba indicados.'
    const linesFirma = doc.splitTextToSize(firma, maxWidth)
    doc.text(linesFirma, margin, yPosition)
    yPosition += linesFirma.length * 5 + 10

    doc.text('Firma del vendedor.', margin, yPosition)
    doc.text('Firma del comprador.', pageWidth - 80, yPosition)

    // Retornar el buffer del PDF
    const pdfBuffer = doc.output('arraybuffer')
    // console.log('✅ Contrato de compraventa generado exitosamente')
    return new Uint8Array(pdfBuffer)
  } catch (error) {
    console.error('❌ Error generando contrato de compraventa:', error)
    throw error
  }
}

// Función para generar contrato de depósito
export async function generarContratoDeposito(
  deposito: DepositoData
): Promise<Uint8Array> {
  try {
    const doc = new jsPDF()
    const pageWidth = doc.internal.pageSize.width
    const margin = 10
    const maxWidth = pageWidth - margin * 2 // Ancho disponible respetando márgenes izquierdo y derecho
    let yPosition = margin

    // Configurar fuente
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(10)

    // Logo de Seven Cars (primero)
    yPosition = await addLogoToContract(doc, yPosition)

    // Fecha y lugar (después del logo)
    const fecha = formatearFechaCompleta(new Date())
    doc.setFontSize(10)
    doc.setFont('helvetica', 'normal')
    doc.text(`En Alaquàs, a ${fecha}`, margin, yPosition)
    yPosition += 10

    // REUNIDOS
    doc.setFontSize(11)
    doc.setFont('helvetica', 'bold')
    doc.text('REUNIDOS', margin, yPosition)
    yPosition += 6

    // DE UNA PARTE
    doc.setFont('helvetica', 'bold')
    doc.text('DE UNA PARTE:', margin, yPosition)
    yPosition += 5
    doc.setFont('helvetica', 'normal')
    doc.text(
      'D. Sebastian Pelella, mayor de edad, con NIE Z0147238C, en representación de Sevencars Motors SL',
      margin,
      yPosition
    )
    yPosition += 5
    doc.text(
      'con CIF B75939868 y domicilio en Cami dels Mollons Nº 36 Bajo de Alaquas, Valencia,',
      margin,
      yPosition
    )
    yPosition += 5
    doc.text('en calidad de depositario', margin, yPosition)
    yPosition += 8

    // Y DE OTRA PARTE
    doc.setFont('helvetica', 'bold')
    doc.text('Y DE OTRA PARTE:', margin, yPosition)
    yPosition += 5
    doc.setFont('helvetica', 'normal')
    const nombreCompleto = `${deposito.cliente.nombre} ${deposito.cliente.apellidos}`
    const direccionCompleta =
      `${deposito.cliente.direccion || ''}, ${deposito.cliente.ciudad || ''}, ${deposito.cliente.provincia || ''}`
        .trim()
        .replace(/^,\s*|,\s*$/g, '')
    doc.text(
      `Y de otra parte, D.${nombreCompleto}, mayor de edad, con DNI ${deposito.cliente.dni || 'No especificado'},`,
      margin,
      yPosition
    )
    yPosition += 5
    doc.text(
      `con domicilio en ${direccionCompleta || 'No especificado'}, en calidad de depositante.`,
      margin,
      yPosition
    )
    yPosition += 10

    doc.text(
      'Ambas partes tienen y se reconocen la capacidad legal necesaria para otorgar el presente',
      margin,
      yPosition
    )
    yPosition += 5
    doc.text(
      'documento privado GESTION DE VENTA del vehículo automóvil que se especifica, en las siguientes',
      margin,
      yPosition
    )
    yPosition += 12

    // CLAUSULAS
    doc.setFont('helvetica', 'bold')
    doc.text('CLAUSULAS', margin, yPosition)
    yPosition += 8

    // Clausula 1
    doc.setFont('helvetica', 'normal')
    doc.text(
      '1. Que las características básicas del vehículo usado objeto de este documento son las siguientes:',
      margin,
      yPosition
    )
    yPosition += 6

    // Dos columnas para los datos del vehículo
    const col1X = margin + 8
    const col2X = margin + 90
    const lineHeight = 5

    // Columna izquierda - usando writeField para negrita
    writeField(
      doc,
      'Marca y Modelo',
      `${capitalizeText(deposito.vehiculo.marca)} ${capitalizeText(deposito.vehiculo.modelo)}`,
      col1X,
      yPosition
    )
    writeField(
      doc,
      'Nº Bastidor',
      deposito.vehiculo.bastidor,
      col1X,
      yPosition + lineHeight
    )
    writeField(
      doc,
      'Matrícula',
      deposito.vehiculo.matricula,
      col1X,
      yPosition + lineHeight * 2
    )

    // Columna derecha - usando writeField para negrita
    const fechaMatriculacion = deposito.vehiculo.fechaMatriculacion
      ? new Date(deposito.vehiculo.fechaMatriculacion).toLocaleDateString(
          'es-ES'
        )
      : 'No especificada'
    writeField(
      doc,
      'Fecha 1ª Matriculación',
      fechaMatriculacion,
      col2X,
      yPosition
    )
    const kilometraje = deposito.vehiculo.kms
      ? `${deposito.vehiculo.kms.toLocaleString('es-ES')} km`
      : 'No especificado'
    writeField(doc, 'Kilometraje', kilometraje, col2X, yPosition + lineHeight)

    yPosition += lineHeight * 3 + 6

    // Clausula 2 - texto normal
    doc.setFont('helvetica', 'normal')
    const clausula2 =
      '2. El depositante es el actual y único titular del vehiculo, y declara que no pesa sobre el vehículo ninguna carga o gravamen ni impuesto, deuda o sanción pendientes de abono en la fecha de la firma de este contrato, comprometiéndose en caso contrario a regularizar tal situación a su exclusivo cargo. En caso de que no se pudiese tramitar el cambio de nombre se resolvería el contrato y devolverían las cantidades abonadas.'
    const lines2 = doc.splitTextToSize(clausula2, maxWidth)
    doc.text(lines2, margin, yPosition)
    yPosition += lines2.length * 5 + 5 // 5px de espacio entre cláusulas

    // Clausula 3 - usando EXACTAMENTE la misma lógica que contrato de reserva
    const multa = deposito.deposito.multa_retiro_anticipado || 0
    const diasGestion = deposito.deposito.dias_gestion || 'No especificado'

    // Crear el texto completo y dividirlo en líneas (EXACTO como contrato de reserva)
    const textoPunto3 = `3. El depositante autoriza al depositario a poder publicar el vehículo en cuantos medios así considere para poder realizar la venta del mismo, siendo los gastos a cargo del depositario. Durante el plazo de ${diasGestion} días el vehículo solo podrá venderse por parte del depositario, sino deberá abonar la cantidad de ${formatCurrency(multa)} (${numeroALetras(multa)} euros) en concepto de gastos por tramitación, así como durante el periodo de plazo fijado no podrá ser retirado de las instalaciones de SevenCars.`

    // Dividir el texto en líneas que se ajusten al ancho de la página (EXACTO como contrato de reserva)
    const lineasPunto3 = doc.splitTextToSize(
      textoPunto3,
      pageWidth - margin * 2
    )

    // Escribir cada línea (EXACTO como contrato de reserva)
    doc.setFont('helvetica', 'normal')
    for (let i = 0; i < lineasPunto3.length; i++) {
      doc.text(lineasPunto3[i], margin, yPosition)
      yPosition += 4.5
    }

    yPosition += 5 // 5px de espacio entre cláusulas

    // Clausula 4 - texto normal
    doc.setFont('helvetica', 'normal')
    const clausula4 =
      '4. El vendedor declara que no existen vicios ocultos o que tengan su origen en dolo o mala fe.'
    const lines4 = doc.splitTextToSize(clausula4, maxWidth)
    doc.text(lines4, margin, yPosition)
    yPosition += lines4.length * 5 + 5 // 5px de espacio entre cláusulas

    // Clausula 5 - usando EXACTAMENTE la misma lógica que contrato de reserva
    const monto = deposito.deposito.monto_recibir || 0
    const montoEnLetras = numeroALetras(monto)
    const numeroCuenta = deposito.deposito.numero_cuenta || 'No especificado'

    // Crear el texto completo y dividirlo en líneas (EXACTO como contrato de reserva)
    const textoPunto5 = `5. El precio de la compraventa que recibirá el depositante es de ${formatCurrency(monto)} (${montoEnLetras} euros) impuestos incluidos. Mediante transferencia inmediata el día de la venta al numero de cuenta proporcionado: ${numeroCuenta}.`

    // Dividir el texto en líneas que se ajusten al ancho de la página (EXACTO como contrato de reserva)
    const lineasPunto5 = doc.splitTextToSize(
      textoPunto5,
      pageWidth - margin * 2
    )

    // Escribir cada línea (EXACTO como contrato de reserva)
    doc.setFont('helvetica', 'normal')
    for (let i = 0; i < lineasPunto5.length; i++) {
      doc.text(lineasPunto5[i], margin, yPosition)
      yPosition += 4.5
    }

    yPosition += 5 // 5px de espacio entre cláusulas

    // Clausula 6 - texto normal
    doc.setFont('helvetica', 'normal')
    const clausula6 =
      '6. Para cualquier litigio que surja entre las partes de la interpretación o cumplimiento del presente contrato, éstas, con expresa renuncia al fuero que pudiera corresponderles, se someterán a los Juzgados y Tribunales de Valencia.'
    const lines6 = doc.splitTextToSize(clausula6, maxWidth)
    doc.text(lines6, margin, yPosition)
    yPosition += lines6.length * 5 + 5 // 5px de espacio entre cláusulas

    // Firma
    const firma =
      'Y para que así conste, firman el presente contrato de compraventa, por duplicado, en la fecha y lugar arriba indicados.'
    const linesFirma = doc.splitTextToSize(firma, maxWidth)
    doc.text(linesFirma, margin, yPosition)
    yPosition += linesFirma.length * 5 + 5

    doc.text('Firma del depositario.', margin, yPosition)
    doc.text('Firma del depositante.', pageWidth - 80, yPosition)

    // Retornar el buffer del PDF
    return new Uint8Array(doc.output('arraybuffer'))
  } catch (error) {
    console.error('Error generando contrato de depósito:', error)
    throw error
  }
}

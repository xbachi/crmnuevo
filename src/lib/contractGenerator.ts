// Generador de contratos con jsPDF
import jsPDF from 'jspdf'
import { formatCurrency } from './utils'

// Función para cargar el logo SVG y convertirlo a imagen
async function loadLogoSVG(): Promise<string> {
  try {
    const response = await fetch('/logocontrato.svg')
    if (!response.ok) {
      throw new Error('No se pudo cargar el logo')
    }
    let svgText = await response.text()

    // Convertir solo el texto (elementos blancos) a negro, mantener el logo verde
    svgText = svgText
      .replace(/fill="#FEFEFE"/g, 'fill="#000000"') // Solo cambiar elementos blancos a negro
      .replace(/fill="#FEFEFD"/g, 'fill="#000000"') // Solo cambiar elementos blancos a negro
      .replace(/fill="white"/g, 'fill="#000000"') // Solo cambiar elementos blancos a negro
      .replace(/fill="none"/g, 'fill="#000000"') // Solo cambiar elementos sin fill a negro

    // Crear un canvas para convertir SVG a imagen
    const canvas = document.createElement('canvas')
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('No se pudo crear contexto de canvas')

    // Crear imagen desde SVG modificado
    const img = new Image()
    const svgBlob = new Blob([svgText], { type: 'image/svg+xml' })
    const url = URL.createObjectURL(svgBlob)

    return new Promise((resolve, reject) => {
      img.onload = () => {
        // Configurar canvas con tamaño del logo
        canvas.width = 200 // Ancho fijo
        canvas.height = 80 // Alto fijo

        // Dibujar imagen en canvas
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height)

        // Convertir a data URL
        const dataURL = canvas.toDataURL('image/png')
        URL.revokeObjectURL(url)
        resolve(dataURL)
      }
      img.onerror = () => {
        URL.revokeObjectURL(url)
        reject(new Error('Error cargando imagen SVG'))
      }
      img.src = url
    })
  } catch (error) {
    console.error('Error cargando logo:', error)
    return ''
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
    if (resto === 0) return centenas[centena]
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
        milesTexto = centenas[centena] + ' mil'
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

export async function generarContratoReserva(deal: DealData): Promise<void> {
  try {
    const doc = new jsPDF()
    const pageWidth = doc.internal.pageSize.width
    const margin = 15
    let yPosition = margin

    // Configurar fuente
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(11)

    // Título del contrato (primero)
    doc.setFontSize(14)
    doc.setFont('helvetica', 'bold')
    doc.setTextColor(0, 0, 0) // Negro
    doc.text('CONTRATO DE RESERVA DE VEHÍCULO', pageWidth / 2, yPosition, {
      align: 'center',
    })
    yPosition += 12

    // Logo de Seven Cars
    try {
      const logoDataURL = await loadLogoSVG()
      if (logoDataURL) {
        // Ajustar tamaño del logo (ancho máximo 60mm, altura reducida)
        const logoWidth = 60
        const logoHeight = 20 // Altura fija más pequeña

        // Centrar el logo
        const logoX = (pageWidth - logoWidth) / 2

        // Agregar imagen al PDF
        doc.addImage(
          logoDataURL,
          'PNG',
          logoX,
          yPosition,
          logoWidth,
          logoHeight
        )

        yPosition += logoHeight + 5
      } else {
        // Fallback al texto si no se puede cargar el logo
        doc.setFontSize(12)
        doc.setFont('helvetica', 'bold')
        doc.setTextColor(0, 0, 0) // Negro
        doc.text('SEVEN CARS MOTORS S.L.', pageWidth / 2, yPosition, {
          align: 'center',
        })
        yPosition += 10
      }
    } catch (error) {
      console.error('Error procesando logo:', error)
      // Fallback al texto
      doc.setFontSize(12)
      doc.setFont('helvetica', 'bold')
      doc.setTextColor(0, 0, 0) // Negro
      doc.text('SEVEN CARS MOTORS S.L.', pageWidth / 2, yPosition, {
        align: 'center',
      })
      yPosition += 10
    }

    // Línea decorativa
    doc.setDrawColor(0, 0, 0)
    doc.setLineWidth(0.5)
    doc.line(margin, yPosition, pageWidth - margin, yPosition)
    yPosition += 12

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

    doc.text(
      `MARCA ${deal.vehiculo?.marca || 'marca vehiculo'}`,
      margin + 10,
      yPosition
    )
    yPosition += 5
    doc.text(
      `MODELO ${deal.vehiculo?.modelo || 'modelo vehiculo'}`,
      margin + 10,
      yPosition
    )
    yPosition += 5
    doc.text(
      `MATRICULA ${deal.vehiculo?.matricula || 'matricula vehiculo'}`,
      margin + 10,
      yPosition
    )
    yPosition += 10

    // Punto 2 - Precio del vehículo
    const precio = deal.importeTotal || deal.vehiculo?.precioPublicacion || 0
    const precioEnLetras = numeroALetras(Math.floor(precio))

    doc.text('2. El precio del vehículo indicado es :', margin, yPosition)
    yPosition += 6
    doc.text(
      `${formatCurrency(precio)} (${precioEnLetras} euros)`,
      margin + 10,
      yPosition
    )
    yPosition += 10

    // Punto 3 - Monto de reserva
    const montoReserva = deal.importeSena || 0
    const montoReservaEnLetras = numeroALetras(Math.floor(montoReserva))

    const formaPagoReserva = getFormaPagoReserva(
      deal.formaPagoSena || 'efectivo'
    )
    const textoPunto3 = `3. Que la parte vendedora recibe de la parte compradora ${formatCurrency(montoReserva)} (${montoReservaEnLetras} euros) mediante ${formaPagoReserva} siendo este documento su más eficaz carta de pago,`
    const lineasPunto3 = doc.splitTextToSize(
      textoPunto3,
      pageWidth - margin * 2
    )
    doc.text(lineasPunto3, margin, yPosition)
    yPosition += lineasPunto3.length * 4.5 + 8 // Espacio basado en número de líneas + separación

    // Punto 4 - Gastos de transmisión
    const textoPunto4 =
      '4. Los gastos de transmisión del vehiculo serán por cuenta de la parte vendedora. Una vez realizada la correspondiente transferencia en Tráfico, el vendedor entregará materialmente al comprador la posesión del vehículo, haciéndose el comprador cargo de cuantas responsabilidades puedan contraerse por la propiedad del vehículo y su tenencia y uso a partir de dicho momento de la entrega.'
    const lineasPunto4 = doc.splitTextToSize(
      textoPunto4,
      pageWidth - margin * 2
    )
    doc.text(lineasPunto4, margin, yPosition)
    yPosition += lineasPunto4.length * 4.5 + 8 // Espacio basado en número de líneas + separación

    // Punto 5 - Libre de cargas
    const textoPunto5 =
      '5. Que el vehiculo se encuentra libre de cargas y gravámenes que pudieran impedir la formalización de la transferencia, por el adquiriente, en la Jefatura de Trafico.'
    const lineasPunto5 = doc.splitTextToSize(
      textoPunto5,
      pageWidth - margin * 2
    )
    doc.text(lineasPunto5, margin, yPosition)
    yPosition += lineasPunto5.length * 4.5 + 8 // Espacio basado en número de líneas + separación

    // Punto 6 - Plazo de pago
    doc.text(
      '6. Se establece un plazo de 7 días para abonar el resto del importe indicado a la parte vendedora.',
      margin,
      yPosition
    )
    yPosition += 10

    // Firma
    doc.text('Y en prueba de conformidad, firman', margin, yPosition)
    yPosition += 15

    // Espacio para firmas
    doc.text('La parte vendedora', margin, yPosition)
    doc.text('La parte compradora', pageWidth / 2 + 20, yPosition)
    yPosition += 20

    // Líneas para firmas
    doc.line(margin, yPosition, margin + 80, yPosition)
    doc.line(pageWidth / 2 + 20, yPosition, pageWidth / 2 + 100, yPosition)

    // Descargar el PDF
    const nombreArchivo = `contrato-reserva-${deal.numero}.pdf`
    doc.save(nombreArchivo)

    console.log('✅ Contrato generado exitosamente:', nombreArchivo)
  } catch (error) {
    console.error('❌ Error generando contrato PDF:', error)
    // Fallback a versión HTML si falla PDF
    generarContratoHTML(deal)
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
export async function generarContratoVenta(deal: DealData): Promise<void> {
  const doc = new jsPDF()
  const pageWidth = doc.internal.pageSize.getWidth()
  const pageHeight = doc.internal.pageSize.getHeight()
  const margin = 15
  let yPosition = 15

  // Título del contrato
  doc.setFontSize(16)
  doc.setFont('helvetica', 'bold')
  doc.setTextColor(0, 0, 0)
  doc.text('CONTRATO DE VENTA DE VEHÍCULO', pageWidth / 2, yPosition, {
    align: 'center',
  })
  yPosition += 12

  // Logo de Seven Cars
  try {
    const logoDataURL = await loadLogoSVG()
    if (logoDataURL) {
      const logoWidth = 60
      const logoHeight = 20
      const logoX = (pageWidth - logoWidth) / 2
      doc.addImage(logoDataURL, 'PNG', logoX, yPosition, logoWidth, logoHeight)
      yPosition += logoHeight + 8
    } else {
      doc.setFontSize(12)
      doc.setFont('helvetica', 'bold')
      doc.text('SEVEN CARS MOTORS S.L.', pageWidth / 2, yPosition, {
        align: 'center',
      })
      yPosition += 10
    }
  } catch (error) {
    doc.setFontSize(12)
    doc.setFont('helvetica', 'bold')
    doc.text('SEVEN CARS MOTORS S.L.', pageWidth / 2, yPosition, {
      align: 'center',
    })
    yPosition += 10
  }

  // Línea decorativa
  doc.setDrawColor(0, 0, 0)
  doc.setLineWidth(0.5)
  doc.line(margin, yPosition, pageWidth - margin, yPosition)
  yPosition += 10

  // Fecha del contrato
  const fechaContrato = new Date()
  doc.setFontSize(11)
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

  // Parte vendedora
  doc.setFontSize(10)
  doc.text('De una parte:', margin, yPosition)
  yPosition += 6

  const textoVendedor =
    'D. Sebastián Pelella mayor de edad, con NIE Z0147238C en representación de Seven Cars Motors, s.l.. con CIF B-75939868 y con domicilio Camí dels Mollons, 36 de Alaquàs, Valencia, en calidad de vendedores, y en adelante parte vendedora.'
  const lineasVendedor = doc.splitTextToSize(
    textoVendedor,
    pageWidth - margin * 2
  )
  doc.text(lineasVendedor, margin, yPosition)
  yPosition += lineasVendedor.length * 4.5 + 8

  // Parte compradora
  doc.text('Y de otra parte:', margin, yPosition)
  yPosition += 6

  // Datos del cliente en un párrafo continuo
  const textoComprador = `D/DÑA ${nombreCompleto || 'NOMBRE DE CLIENTE'} mayor de edad, con DNI ${deal.cliente?.dni || 'DNI CLIENTE'}, con domicilio ${direccionCompleta}, con telefono ${deal.cliente?.telefono || 'TEL CLIENTE'} y email ${deal.cliente?.email || 'EMAIL CLIENTE'} en calidad de compradores, y en adelante parte compradora.`
  const lineasComprador = doc.splitTextToSize(
    textoComprador,
    pageWidth - margin * 2
  )
  doc.text(lineasComprador, margin, yPosition)
  yPosition += lineasComprador.length * 4.5 + 4

  // Acuerdo común
  const textoAcuerdo =
    'Ambos de común acuerdo y reconociéndose capacidad legal para ello, formalizan la compraventa, con arreglo a las siguientes condiciones:'
  const lineasAcuerdo = doc.splitTextToSize(
    textoAcuerdo,
    pageWidth - margin * 2
  )
  doc.text(lineasAcuerdo, margin, yPosition)
  yPosition += lineasAcuerdo.length * 4.5 + 4

  // Punto 1 - Información del vehículo
  const textoPunto1 =
    '1. El vendedor vende al comprador el siguiente vehículo después de comprobarlo y examinarlo a su entera conformidad, aceptando su estado, las características de uso y su fecha de matriculación:'
  const lineasPunto1 = doc.splitTextToSize(textoPunto1, pageWidth - margin * 2)
  doc.text(lineasPunto1, margin, yPosition)
  yPosition += lineasPunto1.length * 4.5 + 6

  // Datos del vehículo en formato compacto con negrita para datos dinámicos
  doc.setFont('helvetica', 'normal')
  doc.text('MARCA:', margin + 5, yPosition)
  doc.setFont('helvetica', 'bold')
  doc.text(
    `${deal.vehiculo?.marca || 'marca vehiculo'}`,
    margin + 22,
    yPosition
  )

  doc.setFont('helvetica', 'normal')
  doc.text('MODELO:', pageWidth / 2, yPosition)
  doc.setFont('helvetica', 'bold')
  doc.text(
    `${deal.vehiculo?.modelo || 'modelo vehiculo'}`,
    pageWidth / 2 + 18,
    yPosition
  )

  yPosition += 4

  doc.setFont('helvetica', 'normal')
  doc.text('MATRICULA:', margin + 5, yPosition)
  doc.setFont('helvetica', 'bold')
  doc.text(
    `${deal.vehiculo?.matricula || 'matricula vehiculo'}`,
    margin + 28,
    yPosition
  )

  doc.setFont('helvetica', 'normal')
  doc.text('BASTIDOR:', pageWidth / 2, yPosition)
  doc.setFont('helvetica', 'bold')
  doc.text(
    `${deal.vehiculo?.bastidor || 'bastidor vehiculo'}`,
    pageWidth / 2 + 23,
    yPosition
  )

  yPosition += 8

  // Precio y garantía con negrita para datos dinámicos
  doc.setFont('helvetica', 'normal')
  doc.text('Por la cantidad de ', margin, yPosition)
  doc.setFont('helvetica', 'bold')
  doc.text(`${formatCurrency(precio)}`, margin + 35, yPosition)
  doc.setFont('helvetica', 'normal')
  doc.text(
    ' (',
    margin + 35 + doc.getTextWidth(formatCurrency(precio)),
    yPosition
  )
  doc.setFont('helvetica', 'bold')
  doc.text(
    `${precioEnLetras} euros  `,
    margin + 35 + doc.getTextWidth(formatCurrency(precio)) + 3,
    yPosition
  )
  doc.setFont('helvetica', 'normal')
  doc.text(
    ') - Garantizado por 12 Meses',
    margin +
      35 +
      doc.getTextWidth(formatCurrency(precio)) +
      doc.getTextWidth(`${precioEnLetras} euros  `) +
      6,
    yPosition
  )
  yPosition += 10

  // Sección ENTREGA DE VEHÍCULO
  doc.setFont('helvetica', 'bold')
  doc.text('ENTREGA DE VEHÍCULO', margin, yPosition)
  yPosition += 6

  // Punto 2 - Entrega de vehículo
  doc.setFont('helvetica', 'normal')
  const textoPunto2 =
    '2. El vendedor entrega al comprador, las llaves del vehículo, el permiso de circulación, ficha técnica, el manual y recibe la documentación indicada en este acto'
  const lineasPunto2 = doc.splitTextToSize(textoPunto2, pageWidth - margin * 2)
  doc.text(lineasPunto2, margin, yPosition)
  yPosition += lineasPunto2.length * 4.5 + 8

  // Punto 3 - Responsabilidad de reparaciones
  const textoPunto3 =
    '3. El vendedor no se responsabilizara si el comprador reparase el vehículo por su cuenta, sin que el vendedor hubiera dado su autorización, determinando el taller y manera de llevar a cabo la reparación.'
  const lineasPunto3 = doc.splitTextToSize(textoPunto3, pageWidth - margin * 2)
  doc.text(lineasPunto3, margin, yPosition)
  yPosition += lineasPunto3.length * 4.5 + 10

  // Segunda llave con checkboxes
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
  doc.text('Y en prueba de conformidad, firman', margin, yPosition)
  yPosition += 12

  // Firmas
  doc.text('La parte vendedora', margin, yPosition)
  doc.text('La parte compradora', pageWidth / 2 + 10, yPosition)
  yPosition += 20

  // Líneas para firmas
  doc.line(margin, yPosition, margin + 70, yPosition)
  doc.line(pageWidth / 2 + 10, yPosition, pageWidth / 2 + 80, yPosition)

  // Guardar el PDF
  const nombreArchivo = `contrato-venta-${deal.numero || 'sin-numero'}.pdf`
  doc.save(nombreArchivo)
}

// Función para generar factura
// Función para generar factura profesional
export async function generarFactura(
  deal: DealData,
  tipoFactura: 'IVA' | 'REBU' = 'IVA',
  numeroFacturaPersonalizado?: string
): Promise<void> {
  const doc = new jsPDF()
  const pageWidth = doc.internal.pageSize.getWidth()
  const pageHeight = doc.internal.pageSize.getHeight()
  const margin = 15
  let yPosition = 15

  // Generar número de factura
  const numeroFactura =
    numeroFacturaPersonalizado ||
    `FAC-${new Date().getFullYear()}-${String(deal.id || Math.floor(Math.random() * 1000)).padStart(4, '0')}`
  const fechaFactura = new Date()

  // Logo de Seven Cars (centrado)
  try {
    const logoDataURL = await loadLogoSVG()
    if (logoDataURL) {
      const logoWidth = 50
      const logoHeight = 15
      const logoX = (pageWidth - logoWidth) / 2
      doc.addImage(logoDataURL, 'PNG', logoX, yPosition, logoWidth, logoHeight)
    }
  } catch (error) {
    // Fallback al texto
    doc.setFontSize(12)
    doc.setFont('helvetica', 'bold')
    doc.text('SEVEN CARS MOTORS S.L.', pageWidth / 2, yPosition, {
      align: 'center',
    })
  }

  // Mover yPosition después del logo
  yPosition += 20

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
  yPosition += 10

  // Número de factura (debajo del logo)
  doc.setFontSize(10)
  doc.setFont('helvetica', 'normal')
  doc.text(`Nº Factura: ${numeroFactura}`, margin, yPosition)
  yPosition += 5

  // Fecha (debajo del número de factura)
  doc.text(
    `Fecha: ${fechaFactura.toLocaleDateString('es-ES')}`,
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
  doc.text(`DNI: ${deal.cliente?.dni || 'No especificado'}`, margin, yPosition)
  yPosition += 4
  doc.text(
    `Teléfono: ${deal.cliente?.telefono || 'No especificado'}`,
    margin,
    yPosition
  )
  yPosition += 4
  doc.text(
    `Email: ${deal.cliente?.email || 'No especificado'}`,
    margin,
    yPosition
  )
  yPosition += 10

  // Tabla de conceptos
  const totalConIva = deal.importeTotal || 0

  // Cálculo correcto del IVA: el total incluye IVA, calcular subtotal e IVA
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
    `Año: ${deal.vehiculo?.año || 'No especificado'}`,
    margin,
    yPosition + 12
  )
  doc.text(
    `Kms: ${deal.vehiculo?.kms ? deal.vehiculo.kms.toLocaleString('es-ES') : 'No especificados'}`,
    margin,
    yPosition + 16
  )
  doc.text(
    `Bastidor: ${deal.vehiculo?.bastidor || 'No especificado'}`,
    margin,
    yPosition + 20
  )

  // Datos de la tabla (sin cantidad) - ajustar posición para no superponerse con detalles
  doc.text(formatCurrency(subtotal), margin + 120, yPosition + 20)
  doc.text(formatCurrency(total), margin + 160, yPosition + 20)
  yPosition += 30

  // Línea de totales
  doc.line(margin, yPosition, pageWidth - margin, yPosition)
  yPosition += 5

  // Totales
  doc.setFont('helvetica', 'bold')
  doc.text('SUBTOTAL:', margin + 120, yPosition)
  doc.text(formatCurrency(subtotal), margin + 160, yPosition)
  yPosition += 5

  if (tipoFactura === 'IVA') {
    doc.text('IVA (21%):', margin + 120, yPosition)
    doc.text(formatCurrency(iva), margin + 160, yPosition)
    yPosition += 5
  }

  // Línea de total final
  doc.setLineWidth(1)
  doc.line(margin + 120, yPosition, pageWidth - margin, yPosition)
  yPosition += 5

  doc.setFontSize(12)
  doc.text('TOTAL:', margin + 120, yPosition)
  doc.text(formatCurrency(total), margin + 160, yPosition)
  yPosition += 15

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

  // Guardar el PDF
  const nombreArchivo = `factura-${tipoFactura.toLowerCase()}-${numeroFactura}.pdf`
  doc.save(nombreArchivo)
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

// Función para generar contrato de compraventa
export async function generarContratoCompraventa(
  deposito: DepositoData
): Promise<void> {
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
    try {
      const logoDataURL = await loadLogoSVG()
      if (logoDataURL) {
        const logoWidth = 60
        const logoHeight = 20

        const logoX = (pageWidth - logoWidth) / 2
        doc.addImage(
          logoDataURL,
          'PNG',
          logoX,
          yPosition,
          logoWidth,
          logoHeight
        )
        yPosition += logoHeight + 10
      } else {
        doc.setFontSize(12)
        doc.setFont('helvetica', 'bold')
        doc.setTextColor(0, 0, 0)
        doc.text('SEVEN CARS MOTORS S.L.', pageWidth / 2, yPosition, {
          align: 'center',
        })
        yPosition += 15
      }
    } catch (error) {
      console.error('Error procesando logo:', error)
      doc.setFontSize(12)
      doc.setFont('helvetica', 'bold')
      doc.setTextColor(0, 0, 0)
      doc.text('SEVEN CARS MOTORS S.L.', pageWidth / 2, yPosition, {
        align: 'center',
      })
      yPosition += 15
    }

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
      `${deposito.vehiculo.marca} ${deposito.vehiculo.modelo}`,
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
    const clausula5 = `5. El precio de la compra-venta se fija en ${formatCurrency(monto)} (${montoEnLetras} euros) impuestos incluidos (REBU, régimen Especial de Bienes Usados) que se abonan en este momento sirviendo el presente documento como carta de pago. Se abonan en la cuenta indicada por el vendedor ${deposito.deposito.numero_cuenta || 'No especificado'}.`
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

        // Escribir precio completo en negrita sin espacio antes
        doc.setFont('helvetica', 'bold')
        const espacioAntes = beforePrecio ? doc.getTextWidth(beforePrecio) : 0 // Sin espacio adicional
        doc.text(precioCompleto, margin + espacioAntes, currentY)
        doc.setFont('helvetica', 'normal')

        // Escribir texto después del precio con un pequeño espacio
        if (afterPrecio) {
          const espacioDespues = 3 // Espacio después del precio para separar de "impuestos"
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

    // Guardar el PDF
    const nombreArchivo = `contrato-compraventa-${deposito.id}.pdf`
    doc.save(nombreArchivo)
  } catch (error) {
    console.error('Error generando contrato de compraventa:', error)
    throw error
  }
}

// Función para generar contrato de depósito
export async function generarContratoDeposito(
  deposito: DepositoData
): Promise<void> {
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
    try {
      const logoDataURL = await loadLogoSVG()
      if (logoDataURL) {
        // Ajustar tamaño del logo (ancho máximo 60mm, altura reducida)
        const logoWidth = 60
        const logoHeight = 20 // Altura fija más pequeña

        // Centrar el logo
        const logoX = (pageWidth - logoWidth) / 2

        // Agregar imagen al PDF
        doc.addImage(
          logoDataURL,
          'PNG',
          logoX,
          yPosition,
          logoWidth,
          logoHeight
        )

        yPosition += logoHeight + 10
      } else {
        // Fallback al texto si no se puede cargar el logo
        doc.setFontSize(12)
        doc.setFont('helvetica', 'bold')
        doc.setTextColor(0, 0, 0) // Negro
        doc.text('SEVEN CARS MOTORS S.L.', pageWidth / 2, yPosition, {
          align: 'center',
        })
        yPosition += 15
      }
    } catch (error) {
      console.error('Error procesando logo:', error)
      // Fallback al texto
      doc.setFontSize(12)
      doc.setFont('helvetica', 'bold')
      doc.setTextColor(0, 0, 0) // Negro
      doc.text('SEVEN CARS MOTORS S.L.', pageWidth / 2, yPosition, {
        align: 'center',
      })
      yPosition += 15
    }

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

    // Columna izquierda
    doc.text(
      `Marca y Modelo: ${deposito.vehiculo.marca} ${deposito.vehiculo.modelo}`,
      col1X,
      yPosition
    )
    doc.text(
      `Nº Bastidor: ${deposito.vehiculo.bastidor}`,
      col1X,
      yPosition + lineHeight
    )
    doc.text(
      `Matrícula: ${deposito.vehiculo.matricula}`,
      col1X,
      yPosition + lineHeight * 2
    )

    // Columna derecha
    doc.text(
      `Fecha 1ª Matriculación: ${deposito.vehiculo.fechaMatriculacion ? new Date(deposito.vehiculo.fechaMatriculacion).toLocaleDateString('es-ES') : 'No especificada'}`,
      col2X,
      yPosition
    )
    doc.text(
      `Kilometraje: ${deposito.vehiculo.kms ? deposito.vehiculo.kms.toLocaleString('es-ES') : 'No especificado'} km`,
      col2X,
      yPosition + lineHeight
    )

    yPosition += lineHeight * 3 + 6

    // Clausula 2
    const clausula2 =
      '2. El depositante es el actual y único titular del vehiculo, y declara que no pesa sobre el vehículo ninguna carga o gravamen ni impuesto, deuda o sanción pendientes de abono en la fecha de la firma de este contrato, comprometiéndose en caso contrario a regularizar tal situación a su exclusivo cargo. En caso de que no se pudiese tramitar el cambio de nombre se resolvería el contrato y devolverían las cantidades abonadas.'
    const lines2 = doc.splitTextToSize(clausula2, maxWidth)
    doc.text(lines2, margin, yPosition)
    yPosition += lines2.length * 5 + 5

    // Clausula 3
    const multa = deposito.deposito.multa_retiro_anticipado || 0
    const clausula3 = `3. El depositante autoriza al depositario a poder publicar el vehículo en cuantos medios así considere para poder realizar la venta del mismo, siendo los gastos a cargo del depositario. Durante el plazo de ${deposito.deposito.dias_gestion || 'No especificado'} días el vehículo solo podrá venderse por parte del depositario, sino deberá abonar la cantidad de ${formatCurrency(multa)} (${numeroALetras(multa)} euros) en concepto de gastos por tramitación, así como durante el periodo de plazo fijado no podrá ser retirado de las instalaciones de SevenCars.`
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
    const clausula5 = `5. El precio de la compraventa que recibirá el depositante es de ${formatCurrency(monto)} (${numeroALetras(monto)} euros) impuestos incluidos. Mediante transferencia inmediata el día de la venta al numero de cuenta proporcionado: ${deposito.deposito.numero_cuenta || 'No especificado'}.`
    const lines5 = doc.splitTextToSize(clausula5, maxWidth)
    doc.text(lines5, margin, yPosition)
    yPosition += lines5.length * 5 + 5

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
    yPosition += linesFirma.length * 5 + 5

    doc.text('Firma del depositario.', margin, yPosition)
    doc.text('Firma del depositante.', pageWidth - 80, yPosition)

    // Guardar el PDF
    const nombreArchivo = `contrato-deposito-${deposito.id}.pdf`
    doc.save(nombreArchivo)
  } catch (error) {
    console.error('Error generando contrato de depósito:', error)
    throw error
  }
}

// Generador de contratos con jsPDF
import jsPDF from 'jspdf'

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
  const unidades = ['', 'uno', 'dos', 'tres', 'cuatro', 'cinco', 'seis', 'siete', 'ocho', 'nueve']
  const decenas = ['', '', 'veinte', 'treinta', 'cuarenta', 'cincuenta', 'sesenta', 'setenta', 'ochenta', 'noventa']
  const especiales = ['diez', 'once', 'doce', 'trece', 'catorce', 'quince', 'dieciséis', 'diecisiete', 'dieciocho', 'diecinueve']
  const centenas = ['', 'ciento', 'doscientos', 'trescientos', 'cuatrocientos', 'quinientos', 'seiscientos', 'setecientos', 'ochocientos', 'novecientos']
  
  if (numero === 0) return 'cero'
  if (numero < 10) return unidades[numero]
  if (numero < 20) return especiales[numero - 10]
  if (numero < 100) {
    const decena = Math.floor(numero / 10)
    const unidad = numero % 10
    if (unidad === 0) return decenas[decena]
    return decenas[decena] + ' y ' + unidades[unidad]
  }
  if (numero < 1000) {
    const centena = Math.floor(numero / 100)
    const resto = numero % 100
    if (resto === 0) return centenas[centena]
    return centenas[centena] + ' ' + numeroALetras(resto)
  }
  if (numero < 1000000) {
    const miles = Math.floor(numero / 1000)
    const resto = numero % 1000
    let resultado = numeroALetras(miles) + ' mil'
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
    day: 'numeric'
  }
  
  const fechaFormateada = fechaDate.toLocaleDateString('es-ES', opciones)
  const [diaSemana, dia, mes, año] = fechaFormateada.split(', ')
  return `${diaSemana}, ${dia} de ${mes} de ${año}`
}

// Función para formatear fecha con día de la semana
function formatearFechaCompleta(fecha: Date | string | null | undefined): string {
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
    day: 'numeric'
  }
  
  const fechaFormateada = fechaDate.toLocaleDateString('es-ES', opciones)
  // Dividir correctamente la fecha formateada
  const partes = fechaFormateada.split(' ')
  const diaSemana = partes[0]
  const dia = partes[1]
  const mes = partes[3]
  const año = partes[5]
  
  return `${diaSemana}, ${dia} de ${mes} de ${año}`
}

// Función para construir la dirección completa del cliente
function construirDireccionCompleta(cliente: DealData['cliente']): string {
  if (!cliente) return 'DIRECCION DEL CLIENTE COMPLETA, CALLE ALTURA CIUDAD PROVINCIA COD POSTAL'
  
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

export function generarContratoReserva(deal: DealData): void {
  try {
    const doc = new jsPDF()
    const pageWidth = doc.internal.pageSize.width
    const margin = 15
    let yPosition = margin
    
    // Configurar fuente
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(10)
    
    // Título del contrato (primero)
    doc.setFontSize(14)
    doc.setFont('helvetica', 'bold')
    doc.setTextColor(0, 0, 0) // Negro
    doc.text('CONTRATO DE RESERVA DE VEHÍCULO', pageWidth / 2, yPosition, { align: 'center' })
    yPosition += 15
    
    // Logo de Seven Cars (usando texto por ahora, se puede mejorar con imagen)
    doc.setFontSize(12)
    doc.setFont('helvetica', 'bold')
    doc.setTextColor(30, 64, 175) // Azul Seven Cars
    doc.text('SEVEN CARS MOTORS S.L.', pageWidth / 2, yPosition, { align: 'center' })
    yPosition += 10
    
    // Línea decorativa
    doc.setDrawColor(30, 64, 175)
    doc.setLineWidth(0.5)
    doc.line(margin, yPosition, pageWidth - margin, yPosition)
    yPosition += 15
    
    // Fecha y lugar
    doc.setFontSize(10)
    doc.setFont('helvetica', 'normal')
    doc.setTextColor(0, 0, 0) // Negro
    const fechaContrato = deal.fechaReservaDesde || deal.fechaCreacion || new Date()
    doc.text(`En Alaquàs a ${formatearFechaCompleta(fechaContrato)}`, margin, yPosition)
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
    
    const textoVendedor = 'D. Sebastián Pelella mayor de edad, con NIE Z0147238C en representación de Seven Cars Motors, s.l.. con CIF B-75939868 y con domicilio Camí dels Mollons, 36 de Alaquàs, Valencia, en calidad de vendedores, y en adelante parte vendedora.'
    doc.text(doc.splitTextToSize(textoVendedor, pageWidth - margin * 2), margin, yPosition)
    yPosition += 15
    
    // Parte compradora
    doc.setTextColor(0, 0, 0) // Negro
    doc.text('Y de otra parte:', margin, yPosition)
    yPosition += 6
    
    const nombreCompleto = `${deal.cliente?.nombre || ''} ${deal.cliente?.apellidos || ''}`.trim()
    const direccionCompleta = construirDireccionCompleta(deal.cliente)
    const textoComprador = `D/DÑA ${nombreCompleto || 'NOMBRE DE CLIENTE'} Mayor de edad, con DNI ${deal.cliente?.dni || 'DNI CLIENTE'} Con domicilio ${direccionCompleta} en calidad de compradores, y en adelante parte compradora. Con telefono ${deal.cliente?.telefono || 'TEL CLIENTE'} y email ${deal.cliente?.email || 'EMAIL CLIENTE'}`
    doc.text(doc.splitTextToSize(textoComprador, pageWidth - margin * 2), margin, yPosition)
    yPosition += 18
    
    // Sección "EXPONEN"
    doc.setFont('helvetica', 'bold')
    doc.setTextColor(0, 0, 0) // Negro
    doc.text('EXPONEN', margin, yPosition)
    yPosition += 8
    
    // Punto 1 - Información del vehículo
    doc.setFont('helvetica', 'normal')
    doc.setTextColor(0, 0, 0) // Negro
    doc.text('1. La parte vendedora es propietaria del siguiente vehículo:', margin, yPosition)
    yPosition += 6
    
    doc.text(`MARCA ${deal.vehiculo?.marca || 'marca vehiculo'}`, margin + 10, yPosition)
    yPosition += 5
    doc.text(`MODELO ${deal.vehiculo?.modelo || 'modelo vehiculo'}`, margin + 10, yPosition)
    yPosition += 5
    doc.text(`MATRICULA ${deal.vehiculo?.matricula || 'matricula vehiculo'}`, margin + 10, yPosition)
    yPosition += 10
    
    // Punto 2 - Precio del vehículo
    const precio = deal.importeTotal || deal.vehiculo?.precioPublicacion || 0
    const precioEnLetras = numeroALetras(Math.floor(precio))
    
    doc.text('2. El precio del vehículo indicado es :', margin, yPosition)
    yPosition += 6
    doc.text(`${precio.toLocaleString('es-ES')}€ (${precioEnLetras} euros)`, margin + 10, yPosition)
    yPosition += 10
    
    // Punto 3 - Monto de reserva
    const montoReserva = deal.importeSena || 0
    const montoReservaEnLetras = numeroALetras(Math.floor(montoReserva))
    
    const textoPunto3 = `3. Que la parte vendedora recibe de la parte compradora ${montoReserva.toLocaleString('es-ES')}€ (${montoReservaEnLetras} euros) mediante ${deal.formaPagoSena || 'forma de pago'} siendo este documento su más eficaz carta de pago,`
    doc.text(doc.splitTextToSize(textoPunto3, pageWidth - margin * 2), margin, yPosition)
    yPosition += 15
    
    // Punto 4 - Gastos de transmisión
    const textoPunto4 = '4. Los gastos de transmisión del vehiculo serán por cuenta de la parte vendedora. Una vez realizada la correspondiente transferencia en Tráfico, el vendedor entregará materialmente al comprador la posesión del vehículo, haciéndose el comprador cargo de cuantas responsabilidades puedan contraerse por la propiedad del vehículo y su tenencia y uso a partir de dicho momento de la entrega.'
    doc.text(doc.splitTextToSize(textoPunto4, pageWidth - margin * 2), margin, yPosition)
    yPosition += 18
    
    // Punto 5 - Libre de cargas
    const textoPunto5 = '5. Que el vehiculo se encuentra libre de cargas y gravámenes que pudieran impedir la formalización de la transferencia, por el adquiriente, en la Jefatura de Trafico.'
    doc.text(doc.splitTextToSize(textoPunto5, pageWidth - margin * 2), margin, yPosition)
    yPosition += 15
    
    // Punto 6 - Plazo de pago
    doc.text('6. Se establece un plazo de 7 días para abonar el resto del importe indicado a la parte vendedora.', margin, yPosition)
    yPosition += 15
    
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
  const nombreCompleto = `${deal.cliente?.nombre || ''} ${deal.cliente?.apellidos || ''}`.trim()
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
        <div class="fecha">En Alaquàs a ${formatearFechaCompleta(fechaContrato)}</div>
        
        <div class="seccion">Reunidos:</div>
        
        <div class="punto">
            <strong>De una parte:</strong><br>
            D. Sebastián Pelella mayor de edad, con NIE Z0147238C en representación de Seven Cars Motors, s.l..<br>
            con CIF B-75939868 y con domicilio Camí dels Mollons, 36 de Alaquàs, Valencia, en calidad de<br>
            vendedores, y en adelante parte vendedora.
        </div>
        
        <div class="punto">
            <strong>Y de otra parte:</strong><br><br>
            D/DÑA ${nombreCompleto || 'NOMBRE DE CLIENTE'}<br>
            Mayor de edad, con DNI ${deal.cliente?.dni || 'DNI CLIENTE'}<br>
            Con domicilio ${construirDireccionCompleta(deal.cliente)}<br>
            en calidad de compradores, y en adelante parte compradora.<br>
            Con telefono ${deal.cliente?.telefono || 'TEL CLIENTE'}<br>
            y email ${deal.cliente?.email || 'EMAIL CLIENTE'}
        </div>
        
        <div class="seccion">EXPONEN</div>
        
        <div class="punto">
            <strong>1.</strong> La parte vendedora es propietaria del siguiente vehículo:<br>
            <div class="indentado">
                MARCA ${deal.vehiculo?.marca || 'marca vehiculo'}<br>
                MODELO ${deal.vehiculo?.modelo || 'modelo vehiculo'}<br>
                MATRICULA ${deal.vehiculo?.matricula || 'matricula vehiculo'}
            </div>
        </div>
        
        <div class="punto">
            <strong>2.</strong> El precio del vehículo indicado es :<br>
            <div class="indentado">
                ${precio.toLocaleString('es-ES')}€ (${precioEnLetras} euros)
            </div>
        </div>
        
        <div class="punto">
            <strong>3.</strong> Que la parte vendedora recibe de la parte compradora<br>
            <div class="indentado">
                ${montoReserva.toLocaleString('es-ES')}€ (${montoReservaEnLetras} euros)<br>
                mediante ${deal.formaPagoSena || 'forma de pago'} siendo este documento su más eficaz carta de pago,
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
export function generarContratoVenta(deal: DealData): void {
  // TODO: Implementar contrato de venta
  console.log('Generando contrato de venta para:', deal.numero)
}

// Función para generar factura (placeholder)
export function generarFactura(deal: DealData): void {
  // TODO: Implementar factura
  console.log('Generando factura para:', deal.numero)
}
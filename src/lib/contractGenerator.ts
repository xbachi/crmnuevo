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

export function generarContratoReserva(deal: DealData): void {
  try {
    const doc = new jsPDF()
    const pageWidth = doc.internal.pageSize.width
    const margin = 20
    let yPosition = margin
    
    // Configurar fuente
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(12)
    
    // Título
    doc.setFontSize(16)
    doc.setFont('helvetica', 'bold')
    doc.text('CONTRATO DE RESERVA DE VEHÍCULO', pageWidth / 2, yPosition, { align: 'center' })
    yPosition += 20
    
    // Fecha y lugar
    doc.setFontSize(12)
    doc.setFont('helvetica', 'normal')
    const fechaContrato = deal.fechaReservaDesde || deal.fechaCreacion
    doc.text(`En Alaquàs a ${formatearFecha(fechaContrato)}`, margin, yPosition)
    yPosition += 15
    
    // Sección "Reunidos"
    doc.setFont('helvetica', 'bold')
    doc.text('Reunidos:', margin, yPosition)
    yPosition += 10
    
    // Parte vendedora
    doc.setFont('helvetica', 'normal')
    doc.text('De una parte:', margin, yPosition)
    yPosition += 8
    
    const textoVendedor = 'D. Sebastián Pelella mayor de edad, con NIE Z0147238C en representación de Seven Cars Motors, s.l.. con CIF B-75939868 y con domicilio Camí dels Mollons, 36 de Alaquàs, Valencia, en calidad de vendedores, y en adelante parte vendedora.'
    doc.text(doc.splitTextToSize(textoVendedor, pageWidth - margin * 2), margin, yPosition)
    yPosition += 20
    
    // Parte compradora
    doc.text('Y de otra parte:', margin, yPosition)
    yPosition += 8
    
    const nombreCompleto = `${deal.cliente?.nombre || ''} ${deal.cliente?.apellidos || ''}`.trim()
    const textoComprador = `D/DÑA ${nombreCompleto || '[Nombre no especificado]'} Mayor de edad, con DNI ${deal.cliente?.dni || '[DNI no especificado]'} Con domicilio ${deal.cliente?.direccion || '[Dirección no especificada]'} en calidad de compradores, y en adelante parte compradora. Con telefono ${deal.cliente?.telefono || '[Teléfono no especificado]'} y email ${deal.cliente?.email || '[Email no especificado]'}`
    doc.text(doc.splitTextToSize(textoComprador, pageWidth - margin * 2), margin, yPosition)
    yPosition += 25
    
    // Sección "EXPONEN"
    doc.setFont('helvetica', 'bold')
    doc.text('EXPONEN', margin, yPosition)
    yPosition += 10
    
    // Punto 1 - Información del vehículo
    doc.setFont('helvetica', 'normal')
    doc.text('1. La parte vendedora es propietaria del siguiente vehículo:', margin, yPosition)
    yPosition += 8
    
    doc.text(`MARCA ${deal.vehiculo?.marca || '[Marca no especificada]'}`, margin + 10, yPosition)
    yPosition += 6
    doc.text(`MODELO ${deal.vehiculo?.modelo || '[Modelo no especificado]'}`, margin + 10, yPosition)
    yPosition += 6
    doc.text(`MATRICULA ${deal.vehiculo?.matricula || '[Matrícula no especificada]'}`, margin + 10, yPosition)
    yPosition += 10
    
    // Punto 2 - Precio del vehículo
    const precio = deal.importeTotal || deal.vehiculo?.precioPublicacion || 0
    const precioEnLetras = numeroALetras(Math.floor(precio))
    
    doc.text('2. El precio del vehículo indicado es :', margin, yPosition)
    yPosition += 6
    doc.text(`${precio.toLocaleString()} €, ${precioEnLetras} euros`, margin + 10, yPosition)
    yPosition += 6
    
    if (deal.formaPagoSena?.toLowerCase().includes('financiacion') || deal.formaPagoSena?.toLowerCase().includes('financiación')) {
      doc.text('con financiación', margin + 10, yPosition)
    } else {
      doc.text('con campaña de coche', margin + 10, yPosition)
    }
    yPosition += 10
    
    // Punto 3 - Monto de reserva
    const montoReserva = deal.importeSena || 0
    const montoReservaEnLetras = numeroALetras(Math.floor(montoReserva))
    
    const textoPunto3 = `3. Que la parte vendedora recibe de la parte compradora ${montoReserva.toLocaleString()} €, ${montoReservaEnLetras} Euros siendo este documento su más eficaz carta de pago, mediante ${deal.formaPagoSena || 'transferencia'}.`
    doc.text(doc.splitTextToSize(textoPunto3, pageWidth - margin * 2), margin, yPosition)
    yPosition += 15
    
    // Punto 4 - Gastos de transmisión
    const textoPunto4 = '4. Los gastos de transmisión del vehiculo serán por cuenta de la parte vendedora. Una vez realizada la correspondiente transferencia en Tráfico, el vendedor entregará materialmente al comprador la posesión del vehículo, haciéndose el comprador cargo de cuantas responsabilidades puedan contraerse por la propiedad del vehículo y su tenencia y uso a partir de dicho momento de la entrega.'
    doc.text(doc.splitTextToSize(textoPunto4, pageWidth - margin * 2), margin, yPosition)
    yPosition += 20
    
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
    
    doc.text('La parte vendedora', margin, yPosition)
    doc.text('La parte compradora', pageWidth / 2 + 20, yPosition)
    yPosition += 20
    
    // Líneas para firmas
    doc.line(margin, yPosition, margin + 80, yPosition)
    doc.line(pageWidth / 2 + 20, yPosition, pageWidth / 2 + 100, yPosition)
    
    // Información adicional en el pie
    yPosition = doc.internal.pageSize.height - 30
    doc.setFontSize(10)
    doc.text(`Contrato generado el ${new Date().toLocaleDateString('es-ES')} - Deal: ${deal.numero}`, margin, yPosition)
    
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
            body { font-family: 'Times New Roman', serif; font-size: 12px; line-height: 1.4; max-width: 800px; margin: 0 auto; padding: 20px; background: white; }
            .titulo { text-align: center; font-size: 16px; font-weight: bold; margin-bottom: 20px; text-transform: uppercase; }
            .fecha { margin-bottom: 15px; }
            .seccion { font-weight: bold; margin: 15px 0 10px 0; }
            .punto { margin: 8px 0; text-align: justify; }
            .indentado { margin-left: 20px; }
            .firmas { margin-top: 30px; display: flex; justify-content: space-between; }
            .firma { text-align: center; width: 200px; }
            .linea-firma { border-bottom: 1px solid black; margin-top: 40px; height: 1px; }
            .pie { font-size: 10px; text-align: center; margin-top: 30px; color: #666; }
            @media print { body { margin: 0; padding: 15px; } .no-print { display: none; } }
        </style>
    </head>
    <body>
        <div class="titulo">CONTRATO DE RESERVA DE VEHÍCULO</div>
        <div class="fecha">En Alaquàs a ${formatearFecha(fechaContrato)}</div>
        <div class="seccion">Reunidos:</div>
        <div class="punto"><strong>De una parte:</strong><br>D. Sebastián Pelella mayor de edad, con NIE Z0147238C en representación de Seven Cars Motors, s.l..<br>con CIF B-75939868 y con domicilio Camí dels Mollons, 36 de Alaquàs, Valencia, en calidad de<br>vendedores, y en adelante parte vendedora.</div>
        <div class="punto"><strong>Y de otra parte:</strong><br><br>D/DÑA ${nombreCompleto || '[Nombre no especificado]'}<br>Mayor de edad, con DNI ${deal.cliente?.dni || '[DNI no especificado]'}<br>Con domicilio ${deal.cliente?.direccion || '[Dirección no especificada]'} en calidad de compradores, y en adelante parte compradora.<br>Con telefono ${deal.cliente?.telefono || '[Teléfono no especificado]'}<br>y email ${deal.cliente?.email || '[Email no especificado]'}</div>
        <div class="seccion">EXPONEN</div>
        <div class="punto"><strong>1.</strong> La parte vendedora es propietaria del siguiente vehículo:<br><div class="indentado">MARCA ${deal.vehiculo?.marca || '[Marca no especificada]'}<br>MODELO ${deal.vehiculo?.modelo || '[Modelo no especificado]'}<br>MATRICULA ${deal.vehiculo?.matricula || '[Matrícula no especificada]'}</div></div>
        <div class="punto"><strong>2.</strong> El precio del vehículo indicado es :<br><div class="indentado">${precio.toLocaleString()} €, ${precioEnLetras} euros<br>${deal.formaPagoSena?.toLowerCase().includes('financiacion') || deal.formaPagoSena?.toLowerCase().includes('financiación') ? 'con financiación' : 'con campaña de coche'}</div></div>
        <div class="punto"><strong>3.</strong> Que la parte vendedora recibe de la parte compradora<br><div class="indentado">${montoReserva.toLocaleString()} €, ${montoReservaEnLetras} Euros siendo este documento su más eficaz carta de pago, mediante ${deal.formaPagoSena || 'transferencia'}.</div></div>
        <div class="punto"><strong>4.</strong> Los gastos de transmisión del vehiculo serán por cuenta de la parte vendedora. Una vez realizada la<br>correspondiente transferencia en Tráfico, el vendedor entregará materialmente al comprador la posesión<br>del vehículo, haciéndose el comprador cargo de cuantas responsabilidades puedan contraerse por la<br>propiedad del vehículo y su tenencia y uso a partir de dicho momento de la entrega.</div>
        <div class="punto"><strong>5.</strong> Que el vehiculo se encuentra libre de cargas y gravámenes que pudieran impedir la formalización<br>de la transferencia, por el adquiriente, en la Jefatura de Trafico.</div>
        <div class="punto"><strong>6.</strong> Se establece un plazo de 7 días para abonar el resto del importe indicado a la parte vendedora.</div>
        <div class="punto"><strong>Y en prueba de conformidad, firman</strong></div>
        <div class="firmas"><div class="firma">La parte vendedora<br><div class="linea-firma"></div></div><div class="firma">La parte compradora<br><div class="linea-firma"></div></div></div>
        <div class="pie">Contrato generado el ${new Date().toLocaleDateString('es-ES')} - Deal: ${deal.numero}</div>
        <div class="no-print" style="text-align: center; margin-top: 30px;"><button onclick="window.print()" style="padding: 10px 20px; font-size: 14px; background: #3b82f6; color: white; border: none; border-radius: 5px; cursor: pointer;">🖨️ Imprimir Contrato</button></div>
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

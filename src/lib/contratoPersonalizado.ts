// Generador de contrato personalizado con cláusula de garantía de 14 días
import jsPDF from './jspdf-server'
import { formatCurrency, capitalizeText } from './utils'

// Función para convertir números a letras (simplificada)
function numeroALetras(numero: number): string {
  if (numero === 0) return 'cero'
  if (numero < 1000) return `${numero}`
  if (numero < 1000000) {
    const miles = Math.floor(numero / 1000)
    const resto = numero % 1000
    if (resto === 0) return `${miles} mil`
    return `${miles} mil ${resto}`
  }
  return `${numero}`
}

// Función para agregar logo al contrato
async function addLogoToContract(
  doc: jsPDF,
  yPosition: number
): Promise<number> {
  try {
    const fs = require('fs')
    const path = require('path')

    const logoPath = path.join(process.cwd(), 'public', 'logocontrato.png')

    if (fs.existsSync(logoPath)) {
      const logoBuffer = fs.readFileSync(logoPath)
      const logoBase64 = logoBuffer.toString('base64')

      // Agregar imagen al PDF
      doc.addImage(
        `data:image/png;base64,${logoBase64}`,
        'PNG',
        20,
        yPosition,
        40,
        20
      )

      return yPosition + 25
    }
  } catch (error) {
    console.error('Error cargando logo:', error)
  }

  return yPosition + 5
}

// Función para generar contrato personalizado con cláusula de garantía
export async function generarContratoPersonalizado(
  cliente: any,
  vehiculo: any,
  precio: number = 0
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
    doc.text('CONTRATO DE VENTA DE VEHÍCULO', pageWidth / 2, yPosition, {
      align: 'center',
    })
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
    doc.text('en calidad de vendedor.', margin, yPosition)
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

    const textoCliente = `D/Dña ${nombreCompleto}, mayor de edad, con DNI ${cliente.dni}, con domicilio en ${direccionCompleta || 'No especificado'}, en calidad de comprador.`
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

    // Dos columnas para los datos del vehículo
    const col1X = margin + 8
    const col2X = margin + 90
    const lineHeight = 5

    // Columna izquierda
    doc.text(`Marca y Modelo: `, col1X, yPosition)
    doc.setFont('helvetica', 'bold')
    doc.text(
      `${capitalizeText(vehiculo.marca || '')} ${capitalizeText(vehiculo.modelo || '')}`,
      col1X + 35,
      yPosition
    )
    doc.setFont('helvetica', 'normal')
    doc.text(`Nº Bastidor: `, col1X, yPosition + lineHeight)
    doc.setFont('helvetica', 'bold')
    doc.text(
      `${vehiculo.bastidor || '________________'}`,
      col1X + 35,
      yPosition + lineHeight
    )
    doc.setFont('helvetica', 'normal')
    doc.text(`Matrícula: `, col1X, yPosition + lineHeight * 2)
    doc.setFont('helvetica', 'bold')
    doc.text(
      `${vehiculo.matricula || '________________'}`,
      col1X + 35,
      yPosition + lineHeight * 2
    )
    doc.setFont('helvetica', 'normal')

    // Columna derecha
    doc.text(`Fecha 1ª Matriculación: `, col2X, yPosition)
    doc.setFont('helvetica', 'bold')
    doc.text(
      `${vehiculo.fechaMatriculacion ? new Date(vehiculo.fechaMatriculacion).toLocaleDateString('es-ES') : '________________'}`,
      col2X + 50,
      yPosition
    )
    doc.setFont('helvetica', 'normal')
    doc.text(`Kilometraje: `, col2X, yPosition + lineHeight)
    doc.setFont('helvetica', 'bold')
    doc.text(
      `${vehiculo.kms ? vehiculo.kms.toLocaleString('es-ES') : '________________'} km`,
      col2X + 50,
      yPosition + lineHeight
    )
    doc.setFont('helvetica', 'normal')
    doc.text(`Color: `, col2X, yPosition + lineHeight * 2)
    doc.setFont('helvetica', 'bold')
    doc.text(
      `${vehiculo.color || '________________'}`,
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

    // Clausula 5 - Precio (dejado en blanco como solicitado)
    const clausula5 = `5. El precio de la compra-venta se fija en ___________________ euros (_____________________________) impuestos incluidos (REBU, régimen Especial de Bienes Usados) que se abonan en este momento sirviendo el presente documento como carta de pago.`
    const lines5 = doc.splitTextToSize(clausula5, maxWidth - 10)
    doc.text(lines5, margin, yPosition)
    yPosition += lines5.length * 5 + 5

    // Clausula 6 - CLAUSULA DE GARANTÍA DE 14 DÍAS (NUEVA)
    const clausula6 = `6. El comprador dispondrá de un plazo de catorce (14) días naturales contados a partir de la fecha de entrega del vehículo, con el fin de comprobar su correcto funcionamiento. Durante éste periodo, el comprador podrá realizar las pruebas necesarias para verificar el estado mecánico y general del vehículo. En caso de detectar alguna anomalía ó defecto no atribuible al mal uso del comprador el vendedor se compromete a reparar sin coste adicional ó si no fuera posible a la devolución del mismo.`
    const lines6 = doc.splitTextToSize(clausula6, maxWidth)
    doc.text(lines6, margin, yPosition)
    yPosition += lines6.length * 5 + 5

    // Clausula 7
    const clausula7 = `7. Que con la firma del presente contrato, EL VENDEDOR entrega y EL COMPRADOR recibe el vehículo descrito, así como toda la documentación del mismo (permiso de circulación, ficha técnica, etc.).`
    const lines7 = doc.splitTextToSize(clausula7, maxWidth)
    doc.text(lines7, margin, yPosition)
    yPosition += lines7.length * 5 + 5

    // Clausula 8
    const clausula8 = `8. Que EL COMPRADOR se compromete a realizar el cambio de titularidad del vehículo en el plazo máximo de 30 días naturales desde la fecha de firma del presente contrato.`
    const lines8 = doc.splitTextToSize(clausula8, maxWidth)
    doc.text(lines8, margin, yPosition)
    yPosition += lines8.length * 5 + 5

    // Clausula 9
    const clausula9 = `9. Que las partes se someten expresamente a la jurisdicción de los Juzgados y Tribunales de Valencia para la resolución de cualquier controversia que pueda surgir en relación con el presente contrato.`
    const lines9 = doc.splitTextToSize(clausula9, maxWidth)
    doc.text(lines9, margin, yPosition)
    yPosition += lines9.length * 5 + 8

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
    doc.text('EL VENDEDOR', margin, yPosition)
    doc.text('EL COMPRADOR', pageWidth / 2 + 20, yPosition)
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
    console.error('Error generando contrato personalizado:', error)
    throw error
  }
}

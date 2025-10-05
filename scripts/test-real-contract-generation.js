async function testRealContractGeneration() {
  const fetch = (await import('node-fetch')).default
  const baseUrl = 'http://localhost:3000'

  try {
    console.log('🧪 Probando generación de contratos con deal real...\n')

    // 1. Obtener un deal real
    console.log('1. Obteniendo deals reales...')
    const dealsResponse = await fetch(`${baseUrl}/api/deals`)
    if (!dealsResponse.ok) {
      console.log('❌ Error obteniendo deals')
      return
    }

    const deals = await dealsResponse.json()
    if (!Array.isArray(deals) || deals.length === 0) {
      console.log('❌ No hay deals para probar')
      return
    }

    const deal = deals[0]
    console.log(`✅ Deal encontrado: ${deal.numero} (ID: ${deal.id})`)
    console.log(`   Vehículo: ${deal.vehiculo?.marca} ${deal.vehiculo?.modelo}`)
    console.log(`   Fecha Matriculación: ${deal.vehiculo?.fechaMatriculacion}`)

    // 2. Generar contrato de reserva
    console.log('\n2. Generando Contrato de Reserva...')
    const reservaResponse = await fetch(`${baseUrl}/api/documents/generate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        dealId: deal.id,
        documentType: 'contrato-reserva',
      }),
    })

    if (reservaResponse.ok) {
      const reservaBuffer = await reservaResponse.buffer()
      console.log(
        `✅ Contrato de Reserva generado: ${reservaBuffer.length} bytes`
      )

      // Verificar si el PDF contiene la fecha de matriculación
      const reservaText = reservaBuffer.toString('utf8')
      if (reservaText.includes('FECHA DE MATRICULACIÓN')) {
        console.log('✅ El contrato contiene "FECHA DE MATRICULACIÓN"')
      } else {
        console.log('❌ El contrato NO contiene "FECHA DE MATRICULACIÓN"')
      }

      if (reservaText.includes('No especificada')) {
        console.log('⚠️  El contrato muestra "No especificada" para la fecha')
      } else if (reservaText.includes('2025')) {
        console.log('✅ El contrato contiene una fecha de 2025')
      }
    } else {
      const error = await reservaResponse.json()
      console.log(`❌ Error generando Contrato de Reserva: ${error.message}`)
    }

    // 3. Generar contrato de venta
    console.log('\n3. Generando Contrato de Venta...')
    const ventaResponse = await fetch(`${baseUrl}/api/documents/generate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        dealId: deal.id,
        documentType: 'contrato-venta',
      }),
    })

    if (ventaResponse.ok) {
      const ventaBuffer = await ventaResponse.buffer()
      console.log(`✅ Contrato de Venta generado: ${ventaBuffer.length} bytes`)
    } else {
      const error = await ventaResponse.json()
      console.log(`❌ Error generando Contrato de Venta: ${error.message}`)
    }

    // 4. Generar factura
    console.log('\n4. Generando Factura...')
    const facturaResponse = await fetch(`${baseUrl}/api/documents/generate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        dealId: deal.id,
        documentType: 'factura',
      }),
    })

    if (facturaResponse.ok) {
      const facturaBuffer = await facturaResponse.buffer()
      console.log(`✅ Factura generada: ${facturaBuffer.length} bytes`)
    } else {
      const error = await facturaResponse.json()
      console.log(`❌ Error generando Factura: ${error.message}`)
    }

    console.log('\n🎉 Pruebas de generación completadas')
  } catch (error) {
    console.error('❌ Error durante las pruebas:', error.message)
  }
}

testRealContractGeneration()

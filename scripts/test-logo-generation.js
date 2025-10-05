async function testLogoGeneration() {
  const fetch = (await import('node-fetch')).default
  const baseUrl = 'http://localhost:3000'

  console.log('🎨 Probando generación de logo en contratos...\n')

  try {
    // Crear un deal de prueba para generar contratos
    console.log('📝 Creando deal de prueba...')
    const dealResponse = await fetch(`${baseUrl}/api/deals`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        clienteId: 1, // Asumiendo que existe un cliente con ID 1
        vehiculoId: 1, // Asumiendo que existe un vehículo con ID 1
        importeTotal: 15000,
        importeSena: 1000,
        formaPagoSena: 'efectivo',
        observaciones: 'Prueba de logo',
        responsableComercial: 'Usuario',
      }),
    })

    if (!dealResponse.ok) {
      console.log(
        '❌ No se pudo crear deal de prueba. Probando con datos existentes...'
      )
      // Intentar obtener un deal existente
      const dealsResponse = await fetch(`${baseUrl}/api/deals`)
      const deals = await dealsResponse.json()

      if (deals.length === 0) {
        console.log('❌ No hay deals existentes para probar')
        return
      }

      const dealId = deals[0].id
      console.log(`✅ Usando deal existente: ${dealId}`)

      // Probar generación de contrato de reserva
      console.log('📄 Generando contrato de reserva...')
      const reservaResponse = await fetch(`${baseUrl}/api/documents/generate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          dealId: dealId,
          documentType: 'contrato-reserva',
          dealNumber: deals[0].numero,
          dealData: deals[0],
        }),
      })

      if (reservaResponse.ok) {
        console.log('✅ Contrato de reserva generado exitosamente')
        const result = await reservaResponse.json()
        console.log(`📁 Archivo guardado en: ${result.url}`)
      } else {
        const error = await reservaResponse.text()
        console.log('❌ Error generando contrato de reserva:', error)
      }
    } else {
      const newDeal = await dealResponse.json()
      console.log(`✅ Deal creado: ${newDeal.id}`)

      // Probar generación de contrato de reserva
      console.log('📄 Generando contrato de reserva...')
      const reservaResponse = await fetch(`${baseUrl}/api/documents/generate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          dealId: newDeal.id,
          documentType: 'contrato-reserva',
          dealNumber: newDeal.numero,
          dealData: newDeal,
        }),
      })

      if (reservaResponse.ok) {
        console.log('✅ Contrato de reserva generado exitosamente')
        const result = await reservaResponse.json()
        console.log(`📁 Archivo guardado en: ${result.url}`)
      } else {
        const error = await reservaResponse.text()
        console.log('❌ Error generando contrato de reserva:', error)
      }
    }
  } catch (error) {
    console.error('❌ Error en la prueba:', error.message)
  }
}

// Ejecutar si se llama directamente
if (require.main === module) {
  testLogoGeneration()
    .then(() => {
      console.log('\n✅ Prueba de logo completada')
      process.exit(0)
    })
    .catch((error) => {
      console.error('❌ Error en la prueba:', error)
      process.exit(1)
    })
}

module.exports = { testLogoGeneration }

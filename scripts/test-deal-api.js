async function testDealAPI() {
  const fetch = (await import('node-fetch')).default
  const baseUrl = 'http://localhost:3000'

  console.log('🧪 Probando API de deals...\n')

  try {
    // Simular exactamente lo que hace la interfaz web
    const dealData = {
      clienteId: 40, // ID que sabemos que existe
      vehiculoId: 299, // ID que sabemos que existe
      importeTotal: 25000,
      importeSena: 2000,
      formaPagoSena: 'efectivo',
      observaciones: 'Deal de prueba desde API',
      responsableComercial: 'Usuario de Prueba',
    }

    console.log('📤 Enviando datos:', dealData)
    console.log('📤 Tipos de datos:', {
      clienteId: typeof dealData.clienteId,
      vehiculoId: typeof dealData.vehiculoId,
      importeTotal: typeof dealData.importeTotal,
      importeSena: typeof dealData.importeSena,
    })

    const response = await fetch(`${baseUrl}/api/deals`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(dealData),
    })

    console.log('📥 Status:', response.status)
    console.log('📥 Headers:', Object.fromEntries(response.headers.entries()))

    const responseText = await response.text()
    console.log('📥 Response body:', responseText)

    if (response.ok) {
      const deal = JSON.parse(responseText)
      console.log('✅ Deal creado exitosamente:', deal)
    } else {
      console.log('❌ Error en la respuesta')
    }
  } catch (error) {
    console.error('❌ Error en la prueba:', error.message)
  }
}

// Ejecutar si se llama directamente
if (require.main === module) {
  testDealAPI()
    .then(() => {
      console.log('\n✅ Prueba completada')
      process.exit(0)
    })
    .catch((error) => {
      console.error('❌ Error en la prueba:', error)
      process.exit(1)
    })
}

module.exports = { testDealAPI }

async function testDocumentURLs() {
  const fetch = (await import('node-fetch')).default
  const baseUrl = 'http://localhost:3000'

  console.log('🧪 Probando URLs de documentos de prueba...\n')

  const testUrls = [
    { name: 'Factura', url: `${baseUrl}/api/test-factura` },
    {
      name: 'Contrato de Reserva',
      url: `${baseUrl}/api/test-contrato-reserva`,
    },
    { name: 'Contrato de Venta', url: `${baseUrl}/api/test-contrato-venta` },
  ]

  for (const test of testUrls) {
    console.log(`⏳ Probando ${test.name}...`)
    try {
      const start = Date.now()
      const response = await fetch(test.url)
      const end = Date.now()
      const time = end - start

      if (response.ok) {
        const contentType = response.headers.get('content-type')
        const contentLength = response.headers.get('content-length')
        console.log(
          `✅ ${test.name}: ${time}ms - ${contentType} (${contentLength} bytes)`
        )
      } else {
        console.log(`❌ ${test.name}: ${time}ms - Error ${response.status}`)
      }
    } catch (error) {
      console.log(`❌ ${test.name}: Error - ${error.message}`)
    }
  }

  console.log('\n📋 URLs de prueba disponibles:')
  console.log('================================')
  testUrls.forEach((test) => {
    console.log(`🔗 ${test.name}: ${test.url}`)
  })

  console.log(
    '\n💡 Puedes abrir estas URLs en tu navegador para ver los documentos generados.'
  )
}

// Ejecutar si se llama directamente
if (require.main === module) {
  testDocumentURLs()
    .then(() => {
      console.log('\n✅ Pruebas completadas')
      process.exit(0)
    })
    .catch((error) => {
      console.error('❌ Error en las pruebas:', error)
      process.exit(1)
    })
}

module.exports = { testDocumentURLs }

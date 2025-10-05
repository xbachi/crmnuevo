async function testDocumentGenerationDebug() {
  const fetch = (await import('node-fetch')).default
  const baseUrl = 'http://localhost:3000'

  try {
    console.log('🔍 Debugging document generation...\n')

    // Obtener un deal real
    const dealsResponse = await fetch(`${baseUrl}/api/deals`)
    const deals = await dealsResponse.json()
    const deal = deals[0]

    console.log(`Deal ID: ${deal.id}`)
    console.log(`Vehículo: ${deal.vehiculo?.marca} ${deal.vehiculo?.modelo}`)
    console.log(`Fecha Matriculación: ${deal.vehiculo?.fechaMatriculacion}`)

    // Probar generación de contrato de reserva
    console.log('\n⏳ Generando Contrato de Reserva...')
    const reservaResponse = await fetch(`${baseUrl}/api/documents/generate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        dealId: deal.id,
        documentType: 'contrato-reserva',
        dealData: deal,
        dealNumber: deal.numero,
      }),
    })

    console.log(`Status: ${reservaResponse.status}`)
    console.log(
      `Headers: ${JSON.stringify(Object.fromEntries(reservaResponse.headers.entries()))}`
    )

    if (!reservaResponse.ok) {
      const errorText = await reservaResponse.text()
      console.log(`Error response: ${errorText}`)
    } else {
      const buffer = await reservaResponse.buffer()
      console.log(`✅ Contrato generado: ${buffer.length} bytes`)
    }
  } catch (error) {
    console.error('❌ Error:', error.message)
  }
}

testDocumentGenerationDebug()

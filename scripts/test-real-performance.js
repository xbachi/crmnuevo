async function testRealPerformance() {
  const fetch = (await import('node-fetch')).default
  const baseUrl = 'http://localhost:3000'

  console.log('🚀 Probando rendimiento real de la aplicación...\n')

  try {
    // Test 1: API de deals
    console.log('⏳ Probando API de deals...')
    const dealsStart = Date.now()
    const dealsResponse = await fetch(`${baseUrl}/api/deals`)
    const dealsTime = Date.now() - dealsStart

    if (dealsResponse.ok) {
      const dealsData = await dealsResponse.json()
      console.log(
        `✅ Deals API: ${dealsTime}ms (${Array.isArray(dealsData) ? dealsData.length : 'N/A'} registros)`
      )
    } else {
      console.log(`❌ Deals API: Error ${dealsResponse.status}`)
    }

    // Test 2: API de clientes
    console.log('⏳ Probando API de clientes...')
    const clientesStart = Date.now()
    const clientesResponse = await fetch(`${baseUrl}/api/clientes`)
    const clientesTime = Date.now() - clientesStart

    if (clientesResponse.ok) {
      const clientesData = await clientesResponse.json()
      console.log(
        `✅ Clientes API: ${clientesTime}ms (${Array.isArray(clientesData) ? clientesData.length : 'N/A'} registros)`
      )
    } else {
      console.log(`❌ Clientes API: Error ${clientesResponse.status}`)
    }

    // Test 3: API de vehículos
    console.log('⏳ Probando API de vehículos...')
    const vehiculosStart = Date.now()
    const vehiculosResponse = await fetch(`${baseUrl}/api/vehiculos`)
    const vehiculosTime = Date.now() - vehiculosStart

    if (vehiculosResponse.ok) {
      const vehiculosData = await vehiculosResponse.json()
      console.log(
        `✅ Vehículos API: ${vehiculosTime}ms (${vehiculosData.vehiculos ? vehiculosData.vehiculos.length : 'N/A'} registros)`
      )
    } else {
      console.log(`❌ Vehículos API: Error ${vehiculosResponse.status}`)
    }

    // Test 4: Página de deals
    console.log('⏳ Probando página de deals...')
    const dealsPageStart = Date.now()
    const dealsPageResponse = await fetch(`${baseUrl}/deals`)
    const dealsPageTime = Date.now() - dealsPageStart

    if (dealsPageResponse.ok) {
      console.log(`✅ Página Deals: ${dealsPageTime}ms`)
    } else {
      console.log(`❌ Página Deals: Error ${dealsPageResponse.status}`)
    }

    // Resumen
    const totalTime = dealsTime + clientesTime + vehiculosTime + dealsPageTime

    console.log('\n📊 Resumen de rendimiento real:')
    console.log('==============================')
    console.log(`🔹 Deals API: ${dealsTime}ms`)
    console.log(`🔹 Clientes API: ${clientesTime}ms`)
    console.log(`🔹 Vehículos API: ${vehiculosTime}ms`)
    console.log(`🔹 Página Deals: ${dealsPageTime}ms`)
    console.log(`\n⏱️  Tiempo total: ${totalTime}ms`)

    if (totalTime < 2000) {
      console.log('🎉 ¡Excelente! La aplicación está funcionando muy rápido.')
    } else if (totalTime < 5000) {
      console.log('✅ Buen rendimiento, la aplicación es usable.')
    } else if (totalTime < 10000) {
      console.log('⚠️  Rendimiento aceptable pero se puede mejorar.')
    } else {
      console.log('❌ Rendimiento lento, necesita más optimización.')
    }

    console.log('\n💡 Comparación con el problema original:')
    console.log('=====================================')
    console.log('🔴 Antes: 35+ segundos (35,000+ ms)')
    console.log(`🟢 Ahora: ${totalTime}ms`)
    console.log(`📈 Mejora: ${Math.round(35000 / totalTime)}x más rápido`)
  } catch (error) {
    console.error('❌ Error durante la prueba:', error.message)
  }
}

testRealPerformance()

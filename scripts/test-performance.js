async function testPerformance() {
  const fetch = (await import('node-fetch')).default
  const baseUrl = 'http://localhost:3000'

  console.log('🚀 Iniciando pruebas de rendimiento...\n')

  const endpoints = [
    { name: 'Clientes', url: `${baseUrl}/api/clientes` },
    { name: 'Deals', url: `${baseUrl}/api/deals` },
    { name: 'Vehículos', url: `${baseUrl}/api/vehiculos` },
    { name: 'Dashboard', url: `${baseUrl}/` },
  ]

  const results = []

  for (const endpoint of endpoints) {
    console.log(`⏳ Probando ${endpoint.name}...`)

    const startTime = Date.now()
    try {
      const response = await fetch(endpoint.url)
      const endTime = Date.now()
      const duration = endTime - startTime

      if (response.ok) {
        console.log(`✅ ${endpoint.name}: ${duration}ms`)
        results.push({ name: endpoint.name, duration, status: 'success' })
      } else {
        console.log(
          `❌ ${endpoint.name}: Error ${response.status} (${duration}ms)`
        )
        results.push({ name: endpoint.name, duration, status: 'error' })
      }
    } catch (error) {
      const endTime = Date.now()
      const duration = endTime - startTime
      console.log(`❌ ${endpoint.name}: Error de conexión (${duration}ms)`)
      results.push({ name: endpoint.name, duration, status: 'error' })
    }

    // Esperar un poco entre requests
    await new Promise((resolve) => setTimeout(resolve, 1000))
  }

  console.log('\n📊 Resumen de resultados:')
  console.log('========================')

  results.forEach((result) => {
    const status = result.status === 'success' ? '✅' : '❌'
    const performance =
      result.duration < 1000
        ? '🟢 Excelente'
        : result.duration < 2000
          ? '🟡 Bueno'
          : result.duration < 5000
            ? '🟠 Aceptable'
            : '🔴 Lento'

    console.log(`${status} ${result.name}: ${result.duration}ms ${performance}`)
  })

  const avgDuration =
    results.reduce((sum, r) => sum + r.duration, 0) / results.length
  console.log(`\n📈 Tiempo promedio: ${Math.round(avgDuration)}ms`)

  if (avgDuration < 2000) {
    console.log('🎉 ¡Rendimiento excelente! Las optimizaciones funcionaron.')
  } else if (avgDuration < 5000) {
    console.log('👍 Rendimiento mejorado, pero aún se puede optimizar más.')
  } else {
    console.log('⚠️  Rendimiento aún lento. Se necesitan más optimizaciones.')
  }
}

// Ejecutar si se llama directamente
if (require.main === module) {
  testPerformance()
    .then(() => {
      console.log('\n✅ Pruebas completadas')
      process.exit(0)
    })
    .catch((error) => {
      console.error('❌ Error en las pruebas:', error)
      process.exit(1)
    })
}

module.exports = { testPerformance }

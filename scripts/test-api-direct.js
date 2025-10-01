// Script simple para probar la API de vehículos
async function testVehiculosAPI() {
  try {
    console.log('🔍 Probando API de vehículos...')

    const response = await fetch('/api/vehiculos')
    console.log('📡 Response status:', response.status)
    console.log('📡 Response ok:', response.ok)

    if (response.ok) {
      const data = await response.json()
      console.log('📊 Data completa:', data)
      console.log('📊 Tipo de data:', typeof data)
      console.log('📊 data.vehiculos existe?', !!data.vehiculos)
      console.log('📊 data es array?', Array.isArray(data))

      const vehiculos = data.vehiculos || data
      console.log('🚗 Vehículos:', vehiculos)
      console.log('🚗 Vehículos es array?', Array.isArray(vehiculos))
      console.log('🚗 Cantidad de vehículos:', vehiculos?.length || 0)

      if (vehiculos && vehiculos.length > 0) {
        console.log('✅ Primeros 3 vehículos:')
        vehiculos.slice(0, 3).forEach((v, i) => {
          console.log(
            `${i + 1}. ${v.marca} ${v.modelo} - ${v.matricula} (${v.estado})`
          )
        })
      } else {
        console.log('❌ No hay vehículos en la respuesta')
      }
    } else {
      const errorText = await response.text()
      console.error('❌ Error:', response.status, response.statusText)
      console.error('❌ Error text:', errorText)
    }
  } catch (error) {
    console.error('❌ Error en fetch:', error)
  }
}

// Ejecutar cuando se carga la página
if (typeof window !== 'undefined') {
  console.log('🚀 Ejecutando test de API...')
  testVehiculosAPI()
}

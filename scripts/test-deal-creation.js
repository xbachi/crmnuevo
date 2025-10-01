async function testDealCreation() {
  const fetch = (await import('node-fetch')).default
  const baseUrl = 'http://localhost:3000'

  console.log('🧪 Probando creación de deal...\n')

  try {
    // Primero obtener clientes y vehículos disponibles
    console.log('📋 Obteniendo clientes disponibles...')
    const clientesResponse = await fetch(`${baseUrl}/api/clientes`)
    const clientes = await clientesResponse.json()
    console.log(`✅ Encontrados ${clientes.length} clientes`)

    if (clientes.length === 0) {
      console.log('❌ No hay clientes disponibles para crear un deal')
      return
    }

    const cliente = clientes[0]
    console.log(
      `👤 Usando cliente: ${cliente.nombre} ${cliente.apellidos} (ID: ${cliente.id})`
    )

    console.log('\n🚗 Obteniendo vehículos disponibles...')
    const vehiculosResponse = await fetch(`${baseUrl}/api/vehiculos`)
    const vehiculosData = await vehiculosResponse.json()
    const vehiculos = vehiculosData.vehiculos || vehiculosData
    console.log(`✅ Encontrados ${vehiculos.length} vehículos`)

    if (vehiculos.length === 0) {
      console.log('❌ No hay vehículos disponibles para crear un deal')
      return
    }

    const vehiculo = vehiculos[0]
    console.log(
      `🚙 Usando vehículo: ${vehiculo.marca} ${vehiculo.modelo} (ID: ${vehiculo.id})`
    )

    // Crear deal de prueba
    console.log('\n📝 Creando deal de prueba...')
    const dealData = {
      clienteId: cliente.id,
      vehiculoId: vehiculo.id,
      importeTotal: 25000,
      importeSena: 2000,
      formaPagoSena: 'efectivo',
      observaciones: 'Deal de prueba para debug',
      responsableComercial: 'Usuario de Prueba',
    }

    console.log('📤 Datos del deal:', dealData)

    const dealResponse = await fetch(`${baseUrl}/api/deals`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(dealData),
    })

    if (dealResponse.ok) {
      const newDeal = await dealResponse.json()
      console.log('✅ Deal creado exitosamente:', newDeal)
    } else {
      const error = await dealResponse.text()
      console.log('❌ Error creando deal:', error)
    }
  } catch (error) {
    console.error('❌ Error en la prueba:', error.message)
  }
}

// Ejecutar si se llama directamente
if (require.main === module) {
  testDealCreation()
    .then(() => {
      console.log('\n✅ Prueba completada')
      process.exit(0)
    })
    .catch((error) => {
      console.error('❌ Error en la prueba:', error)
      process.exit(1)
    })
}

module.exports = { testDealCreation }

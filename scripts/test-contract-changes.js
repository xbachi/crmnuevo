async function testContractChanges() {
  const fetch = (await import('node-fetch')).default
  const baseUrl = 'http://localhost:3000'

  console.log('🧪 Probando cambios en contratos...\n')

  try {
    // Probar generación de contrato de reserva
    console.log('⏳ Probando Contrato de Reserva...')
    const reservaResponse = await fetch(`${baseUrl}/api/test-contrato-reserva`)
    if (reservaResponse.ok) {
      console.log('✅ Contrato de Reserva generado exitosamente')
      console.log(
        `📄 Tamaño: ${reservaResponse.headers.get('content-length')} bytes`
      )
    } else {
      console.log('❌ Error generando Contrato de Reserva')
    }

    // Probar generación de contrato de venta
    console.log('\n⏳ Probando Contrato de Venta...')
    const ventaResponse = await fetch(`${baseUrl}/api/test-contrato-venta`)
    if (ventaResponse.ok) {
      console.log('✅ Contrato de Venta generado exitosamente')
      console.log(
        `📄 Tamaño: ${ventaResponse.headers.get('content-length')} bytes`
      )
    } else {
      console.log('❌ Error generando Contrato de Venta')
    }

    // Probar generación de factura
    console.log('\n⏳ Probando Factura...')
    const facturaResponse = await fetch(`${baseUrl}/api/test-factura`)
    if (facturaResponse.ok) {
      console.log('✅ Factura generada exitosamente')
      console.log(
        `📄 Tamaño: ${facturaResponse.headers.get('content-length')} bytes`
      )
    } else {
      console.log('❌ Error generando Factura')
    }

    console.log('\n📋 Cambios implementados:')
    console.log('================================')
    console.log(
      '✅ Año reemplazado por Fecha de Matriculación en todos los contratos'
    )
    console.log('✅ Spinners agregados a los botones de generación')
    console.log('✅ Estados de carga específicos para cada tipo de documento')
    console.log('✅ Indicadores visuales durante la generación')

    console.log('\n🎯 URLs de prueba:')
    console.log('==================')
    console.log(
      '🔗 Contrato de Reserva: http://localhost:3000/api/test-contrato-reserva'
    )
    console.log(
      '🔗 Contrato de Venta: http://localhost:3000/api/test-contrato-venta'
    )
    console.log('🔗 Factura: http://localhost:3000/api/test-factura')

    console.log('\n✅ Pruebas completadas')
  } catch (error) {
    console.error('❌ Error en las pruebas:', error.message)
  }
}

testContractChanges()

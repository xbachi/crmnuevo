const fs = require('fs')
const path = require('path')

// Función para probar la generación de contrato de reserva
async function testReservationContract() {
  console.log('🧪 [TEST] Iniciando prueba de contrato de reserva...')

  try {
    // Simular datos de prueba
    const testDealData = {
      numero: 'RES-2025-123456',
      fechaCreacion: new Date(),
      cliente: {
        nombre: 'Juan',
        apellidos: 'Pérez García',
        dni: '12345678A',
        telefono: '600123456',
        email: 'juan.perez@email.com',
        calle: 'Calle Mayor 123',
        ciudad: 'Madrid',
        provincia: 'Madrid',
        codPostal: '28001',
      },
      vehiculo: {
        marca: 'Volkswagen',
        modelo: 'Golf VIII',
        matricula: '1234ABC',
        bastidor: 'WVWZZZCDZMW088838',
        kms: 50000,
        precioPublicacion: 15000,
        fechaMatriculacion: '2020-01-15',
        año: 2020,
      },
      importeTotal: 15000,
      importeSena: 1000,
      formaPagoSena: 'efectivo',
      fechaReservaDesde: new Date(),
      fechaReservaExpira: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    }

    console.log('📋 [TEST] Datos de prueba preparados')
    console.log(
      '📋 [TEST] Cliente:',
      testDealData.cliente.nombre,
      testDealData.cliente.apellidos
    )
    console.log(
      '📋 [TEST] Vehículo:',
      testDealData.vehiculo.marca,
      testDealData.vehiculo.modelo
    )
    console.log('📋 [TEST] Precio:', testDealData.importeTotal, '€')
    console.log('📋 [TEST] Reserva:', testDealData.importeSena, '€')

    // Verificar si el logo existe
    const logoPath = path.join(process.cwd(), 'public', 'logocontrato.png')
    console.log('🖼️ [TEST] Verificando logo en:', logoPath)

    if (fs.existsSync(logoPath)) {
      const stats = fs.statSync(logoPath)
      console.log('✅ [TEST] Logo encontrado, tamaño:', stats.size, 'bytes')
    } else {
      console.log('❌ [TEST] Logo NO encontrado en:', logoPath)
    }

    // Probar carga del logo
    console.log('🖼️ [TEST] Probando carga del logo...')
    try {
      const logoBuffer = fs.readFileSync(logoPath)
      const base64 = `data:image/png;base64,${logoBuffer.toString('base64')}`
      console.log(
        '✅ [TEST] Logo cargado exitosamente, tamaño base64:',
        base64.length,
        'caracteres'
      )
    } catch (logoError) {
      console.error('❌ [TEST] Error cargando logo:', logoError.message)
    }

    // Simular llamada a la API
    console.log('🌐 [TEST] Simulando llamada a la API...')
    const response = await fetch(
      'http://localhost:3000/api/documents/generate',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          dealId: 0,
          documentType: 'contrato-reserva',
          dealNumber: testDealData.numero,
          dealData: testDealData,
        }),
      }
    )

    console.log(
      '📡 [TEST] Respuesta de la API:',
      response.status,
      response.statusText
    )

    if (response.ok) {
      const result = await response.json()
      console.log('✅ [TEST] Contrato generado exitosamente')
      console.log('✅ [TEST] URL del documento:', result.url)
    } else {
      const error = await response.json()
      console.error('❌ [TEST] Error en la API:', error)
    }
  } catch (error) {
    console.error('❌ [TEST] Error en la prueba:', error)
    console.error('❌ [TEST] Stack trace:', error.stack)
  }
}

// Ejecutar si se llama directamente
if (require.main === module) {
  testReservationContract()
    .then(() => {
      console.log('\n✅ Pruebas de contrato de reserva completadas')
      process.exit(0)
    })
    .catch((error) => {
      console.error('❌ Error en las pruebas:', error)
      process.exit(1)
    })
}

module.exports = { testReservationContract }

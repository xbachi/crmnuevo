#!/usr/bin/env node

/**
 * Script para verificar manualmente que las funciones del CRM funcionan
 * Ejecuta operaciones REALES y muestra los resultados
 */

const baseUrl = 'http://localhost:3000'

// Colores para la consola
const colors = {
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
  reset: '\x1b[0m',
  bold: '\x1b[1m'
}

const log = (color, ...args) => console.log(color + args.join(' ') + colors.reset)

async function testCRMFunctions() {
  log(colors.cyan + colors.bold, '🚀 VERIFICACIÓN MANUAL DE FUNCIONES CRM')
  log(colors.cyan, '=' .repeat(50))
  
  try {
    // Test servidor disponible
    log(colors.blue, '🔍 Verificando que el servidor esté disponible...')
    const healthCheck = await fetch(baseUrl)
    if (!healthCheck.ok) {
      throw new Error('Servidor no disponible')
    }
    log(colors.green, '✅ Servidor disponible en', baseUrl)

  } catch (error) {
    log(colors.red, '❌ ERROR: Servidor no disponible en', baseUrl)
    log(colors.yellow, '⚠️  Para ejecutar este script:')
    log(colors.yellow, '   1. Abre otra terminal')
    log(colors.yellow, '   2. Ejecuta: npm run dev')
    log(colors.yellow, '   3. Espera a que inicie en localhost:3000')
    log(colors.yellow, '   4. Vuelve a ejecutar este script')
    process.exit(1)
  }

  const results = {
    cliente: null,
    vehiculos: [],
    deal: null,
    deposito: null
  }

  // 1. CREAR CLIENTE
  log(colors.blue, '\n🧑‍💼 PASO 1: Creando cliente real...')
  try {
    const clienteData = {
      nombre: 'Cliente Verificación',
      apellidos: 'Test Manual',
      email: `verificacion.${Date.now()}@test.com`,
      telefono: '666999888',
      dni: `VER${Date.now()}`,
      direccion: 'Calle Verificación 123'
    }

    const response = await fetch(`${baseUrl}/api/clientes`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(clienteData)
    })

    if (response.ok) {
      results.cliente = await response.json()
      log(colors.green, '✅ Cliente creado exitosamente:')
      log(colors.green, `   ID: ${results.cliente.id}`)
      log(colors.green, `   Nombre: ${results.cliente.nombre} ${results.cliente.apellidos}`)
      log(colors.green, `   Email: ${results.cliente.email}`)
    } else {
      throw new Error(`Error ${response.status}`)
    }
  } catch (error) {
    log(colors.red, '❌ Error creando cliente:', error.message)
  }

  // 2. CREAR VEHÍCULOS DE CADA TIPO
  log(colors.blue, '\n🚗 PASO 2: Creando vehículos de cada tipo...')
  const tiposVehiculo = [
    { tipo: 'C', nombre: 'Compra' },
    { tipo: 'I', nombre: 'Inversor' },
    { tipo: 'D', nombre: 'Depósito' },
    { tipo: 'R', nombre: 'Renting' }
  ]

  for (const { tipo, nombre } of tiposVehiculo) {
    try {
      const vehiculoData = {
        referencia: `VER${tipo}${Date.now()}`,
        marca: 'Toyota',
        modelo: 'Corolla',
        matricula: `${Date.now()}${tipo}`,
        bastidor: `VER${tipo}${Date.now()}12345`,
        kms: 50000,
        tipo,
        estado: 'disponible',
        fechaMatriculacion: '2020-01-15'
      }

      const response = await fetch(`${baseUrl}/api/vehiculos`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(vehiculoData)
      })

      if (response.ok) {
        const vehiculo = await response.json()
        results.vehiculos.push(vehiculo)
        log(colors.green, `✅ Vehículo ${nombre} (${tipo}) creado:`)
        log(colors.green, `   ID: ${vehiculo.id}`)
        log(colors.green, `   Referencia: ${vehiculo.referencia}`)
        log(colors.green, `   Marca: ${vehiculo.marca} ${vehiculo.modelo}`)
      } else {
        throw new Error(`Error ${response.status}`)
      }
    } catch (error) {
      log(colors.red, `❌ Error creando vehículo ${nombre}:`, error.message)
    }
  }

  // 3. CREAR DEAL
  if (results.cliente && results.vehiculos.length > 0) {
    log(colors.blue, '\n🤝 PASO 3: Creando deal...')
    try {
      const dealData = {
        clienteId: results.cliente.id,
        vehiculoId: results.vehiculos[0].id, // Usar primer vehículo
        precio: 20000,
        estado: 'reserva',
        importeSena: 2000,
        formaPagoSena: 'transferencia'
      }

      const response = await fetch(`${baseUrl}/api/deals`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(dealData)
      })

      if (response.ok) {
        results.deal = await response.json()
        log(colors.green, '✅ Deal creado exitosamente:')
        log(colors.green, `   ID: ${results.deal.id}`)
        log(colors.green, `   Cliente: ${results.cliente.nombre}`)
        log(colors.green, `   Vehículo: ${results.vehiculos[0].referencia}`)
        log(colors.green, `   Precio: ${dealData.precio}€`)
      } else {
        throw new Error(`Error ${response.status}`)
      }
    } catch (error) {
      log(colors.red, '❌ Error creando deal:', error.message)
    }
  }

  // 4. CREAR DEPÓSITO
  const vehiculoDeposito = results.vehiculos.find(v => v.tipo === 'D')
  if (results.cliente && vehiculoDeposito) {
    log(colors.blue, '\n📦 PASO 4: Creando depósito...')
    try {
      const depositoData = {
        cliente_id: results.cliente.id,
        vehiculo_id: vehiculoDeposito.id,
        estado: 'activo',
        monto_recibir: 15000,
        dias_gestion: 90,
        multa_retiro_anticipado: 500,
        numero_cuenta: 'ES1234567890123456789012'
      }

      const response = await fetch(`${baseUrl}/api/depositos`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(depositoData)
      })

      if (response.ok) {
        results.deposito = await response.json()
        log(colors.green, '✅ Depósito creado exitosamente:')
        log(colors.green, `   ID: ${results.deposito.id}`)
        log(colors.green, `   Cliente: ${results.cliente.nombre}`)
        log(colors.green, `   Vehículo: ${vehiculoDeposito.referencia}`)
        log(colors.green, `   Monto: ${depositoData.monto_recibir}€`)
      } else {
        throw new Error(`Error ${response.status}`)
      }
    } catch (error) {
      log(colors.red, '❌ Error creando depósito:', error.message)
    }
  }

  // 5. PROBAR CAMBIOS DE ESTADO KANBAN
  if (results.vehiculos.length > 0) {
    log(colors.blue, '\n🔄 PASO 5: Probando cambios de estado en kanban...')
    const vehiculo = results.vehiculos[0]
    const estados = ['mecánica', 'fotos', 'publicado']

    for (const estado of estados) {
      try {
        const response = await fetch(`${baseUrl}/api/vehiculos/${vehiculo.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ estado, orden: Math.floor(Math.random() * 100) })
        })

        if (response.ok) {
          log(colors.green, `✅ Vehículo ${vehiculo.referencia} movido a: ${estado}`)
        } else {
          throw new Error(`Error ${response.status}`)
        }
      } catch (error) {
        log(colors.red, `❌ Error moviendo a ${estado}:`, error.message)
      }
    }
  }

  // RESUMEN FINAL
  log(colors.cyan + colors.bold, '\n📊 RESUMEN DE VERIFICACIÓN:')
  log(colors.cyan, '=' .repeat(40))
  
  log(colors.green, `✅ Cliente creado: ${results.cliente ? 'SÍ (ID: ' + results.cliente.id + ')' : 'NO'}`)
  log(colors.green, `✅ Vehículos creados: ${results.vehiculos.length} de 4 tipos`)
  log(colors.green, `✅ Deal creado: ${results.deal ? 'SÍ (ID: ' + results.deal.id + ')' : 'NO'}`)
  log(colors.green, `✅ Depósito creado: ${results.deposito ? 'SÍ (ID: ' + results.deposito.id + ')' : 'NO'}`)

  if (results.cliente) {
    log(colors.cyan, '\n🔍 PARA VERIFICAR EN BASE DE DATOS:')
    log(colors.yellow, `SELECT * FROM Clientes WHERE id = ${results.cliente.id};`)
    
    if (results.vehiculos.length > 0) {
      const vehiculoIds = results.vehiculos.map(v => v.id).join(', ')
      log(colors.yellow, `SELECT * FROM Vehiculos WHERE id IN (${vehiculoIds});`)
    }
    
    if (results.deal) {
      log(colors.yellow, `SELECT * FROM Deals WHERE id = ${results.deal.id};`)
    }
    
    if (results.deposito) {
      log(colors.yellow, `SELECT * FROM Depositos WHERE id = ${results.deposito.id};`)
    }
  }

  log(colors.cyan + colors.bold, '\n✅ VERIFICACIÓN COMPLETADA!')
}

// Ejecutar verificación
testCRMFunctions().catch(error => {
  log(colors.red, '❌ Error fatal:', error.message)
  process.exit(1)
})

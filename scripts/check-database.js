#!/usr/bin/env node

/**
 * Script para verificar directamente la base de datos
 * Muestra los registros creados por los tests
 */

const { Pool } = require('pg')

// Configuración de la base de datos
const pool = new Pool({
  user: process.env.DB_USER || 'postgres',
  host: process.env.DB_HOST || 'localhost',
  database: process.env.DB_NAME || 'crmseven',
  password: process.env.DB_PASSWORD || 'password',
  port: process.env.DB_PORT || 5432,
})

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

async function checkDatabase() {
  log(colors.cyan + colors.bold, '🔍 VERIFICANDO BASE DE DATOS - REGISTROS DE PRUEBA')
  log(colors.cyan, '=' .repeat(60))

  try {
    // Verificar conexión
    await pool.query('SELECT NOW()')
    log(colors.green, '✅ Conexión a base de datos exitosa')

  } catch (error) {
    log(colors.red, '❌ Error conectando a la base de datos:', error.message)
    log(colors.yellow, '⚠️  Verifica la configuración en .env o variables de entorno')
    process.exit(1)
  }

  try {
    // 1. VERIFICAR CLIENTES DE PRUEBA
    log(colors.blue, '\n👥 CLIENTES DE PRUEBA CREADOS:')
    const clientesResult = await pool.query(`
      SELECT id, nombre, apellidos, email, dni, created_at
      FROM Clientes 
      WHERE nombre LIKE '%Test%' OR email LIKE '%test%' OR dni LIKE '%TEST%'
      ORDER BY created_at DESC
      LIMIT 10
    `)
    
    if (clientesResult.rows.length > 0) {
      log(colors.green, `✅ Encontrados ${clientesResult.rows.length} clientes de prueba:`)
      clientesResult.rows.forEach(cliente => {
        log(colors.green, `   ID: ${cliente.id} | ${cliente.nombre} ${cliente.apellidos} | ${cliente.email}`)
      })
    } else {
      log(colors.yellow, '⚠️  No se encontraron clientes de prueba')
    }

    // 2. VERIFICAR VEHÍCULOS DE PRUEBA
    log(colors.blue, '\n🚗 VEHÍCULOS DE PRUEBA CREADOS:')
    const vehiculosResult = await pool.query(`
      SELECT id, referencia, marca, modelo, tipo, estado, created_at
      FROM Vehiculos 
      WHERE referencia LIKE '%TEST%' OR marca LIKE '%Test%'
      ORDER BY created_at DESC
      LIMIT 10
    `)
    
    if (vehiculosResult.rows.length > 0) {
      log(colors.green, `✅ Encontrados ${vehiculosResult.rows.length} vehículos de prueba:`)
      vehiculosResult.rows.forEach(vehiculo => {
        log(colors.green, `   ID: ${vehiculo.id} | ${vehiculo.referencia} | ${vehiculo.marca} ${vehiculo.modelo} | Tipo: ${vehiculo.tipo} | Estado: ${vehiculo.estado}`)
      })
      
      // Contar por tipo
      const tiposCount = await pool.query(`
        SELECT tipo, COUNT(*) as cantidad
        FROM Vehiculos 
        WHERE referencia LIKE '%TEST%' OR marca LIKE '%Test%'
        GROUP BY tipo
        ORDER BY tipo
      `)
      
      log(colors.cyan, '\n📊 Distribución por tipo:')
      tiposCount.rows.forEach(tipo => {
        const tipoName = {
          'C': 'Compra',
          'I': 'Inversor', 
          'D': 'Depósito',
          'R': 'Renting'
        }[tipo.tipo] || tipo.tipo
        log(colors.cyan, `   ${tipo.tipo} (${tipoName}): ${tipo.cantidad}`)
      })
    } else {
      log(colors.yellow, '⚠️  No se encontraron vehículos de prueba')
    }

    // 3. VERIFICAR DEALS DE PRUEBA
    log(colors.blue, '\n🤝 DEALS DE PRUEBA CREADOS:')
    const dealsResult = await pool.query(`
      SELECT d.id, d.numero, d.estado, d.precio, 
             c.nombre as cliente_nombre, v.referencia as vehiculo_ref,
             d.created_at
      FROM Deals d
      LEFT JOIN Clientes c ON d.clienteId = c.id
      LEFT JOIN Vehiculos v ON d.vehiculoId = v.id
      WHERE c.nombre LIKE '%Test%' OR v.referencia LIKE '%TEST%'
      ORDER BY d.created_at DESC
      LIMIT 10
    `)
    
    if (dealsResult.rows.length > 0) {
      log(colors.green, `✅ Encontrados ${dealsResult.rows.length} deals de prueba:`)
      dealsResult.rows.forEach(deal => {
        log(colors.green, `   ID: ${deal.id} | ${deal.numero || 'Sin número'} | ${deal.cliente_nombre} → ${deal.vehiculo_ref} | ${deal.precio}€ | Estado: ${deal.estado}`)
      })
    } else {
      log(colors.yellow, '⚠️  No se encontraron deals de prueba')
    }

    // 4. VERIFICAR DEPÓSITOS DE PRUEBA
    log(colors.blue, '\n📦 DEPÓSITOS DE PRUEBA CREADOS:')
    const depositosResult = await pool.query(`
      SELECT d.id, d.estado, d.monto_recibir,
             c.nombre as cliente_nombre, v.referencia as vehiculo_ref,
             d.created_at
      FROM Depositos d
      LEFT JOIN Clientes c ON d.cliente_id = c.id
      LEFT JOIN Vehiculos v ON d.vehiculo_id = v.id
      WHERE c.nombre LIKE '%Test%' OR v.referencia LIKE '%TEST%'
      ORDER BY d.created_at DESC
      LIMIT 10
    `)
    
    if (depositosResult.rows.length > 0) {
      log(colors.green, `✅ Encontrados ${depositosResult.rows.length} depósitos de prueba:`)
      depositosResult.rows.forEach(deposito => {
        log(colors.green, `   ID: ${deposito.id} | ${deposito.cliente_nombre} → ${deposito.vehiculo_ref} | ${deposito.monto_recibir}€ | Estado: ${deposito.estado}`)
      })
    } else {
      log(colors.yellow, '⚠️  No se encontraron depósitos de prueba')
    }

    // 5. VERIFICAR ESTADOS KANBAN
    log(colors.blue, '\n🔄 ESTADOS ACTUALES EN KANBAN:')
    const kanbanResult = await pool.query(`
      SELECT estado, COUNT(*) as cantidad
      FROM Vehiculos 
      WHERE referencia LIKE '%TEST%' OR marca LIKE '%Test%'
      GROUP BY estado
      ORDER BY estado
    `)
    
    if (kanbanResult.rows.length > 0) {
      log(colors.green, '✅ Estados de vehículos de prueba:')
      kanbanResult.rows.forEach(estado => {
        log(colors.green, `   ${estado.estado}: ${estado.cantidad} vehículos`)
      })
    }

    // RESUMEN FINAL
    log(colors.cyan + colors.bold, '\n📊 RESUMEN GENERAL:')
    log(colors.cyan, '=' .repeat(40))
    
    const totalClientes = clientesResult.rows.length
    const totalVehiculos = vehiculosResult.rows.length
    const totalDeals = dealsResult.rows.length
    const totalDepositos = depositosResult.rows.length
    
    log(colors.green, `✅ Total clientes de prueba: ${totalClientes}`)
    log(colors.green, `✅ Total vehículos de prueba: ${totalVehiculos}`)
    log(colors.green, `✅ Total deals de prueba: ${totalDeals}`)
    log(colors.green, `✅ Total depósitos de prueba: ${totalDepositos}`)

    if (totalClientes + totalVehiculos + totalDeals + totalDepositos > 0) {
      log(colors.cyan, '\n🧹 PARA LIMPIAR DATOS DE PRUEBA:')
      log(colors.yellow, `DELETE FROM Deals WHERE clienteId IN (SELECT id FROM Clientes WHERE nombre LIKE '%Test%');`)
      log(colors.yellow, `DELETE FROM Depositos WHERE cliente_id IN (SELECT id FROM Clientes WHERE nombre LIKE '%Test%');`)
      log(colors.yellow, `DELETE FROM Vehiculos WHERE referencia LIKE '%TEST%' OR marca LIKE '%Test%';`)
      log(colors.yellow, `DELETE FROM Clientes WHERE nombre LIKE '%Test%' OR email LIKE '%test%' OR dni LIKE '%TEST%';`)
    }

  } catch (error) {
    log(colors.red, '❌ Error consultando la base de datos:', error.message)
  } finally {
    await pool.end()
  }
}

// Ejecutar verificación
checkDatabase().catch(error => {
  console.error('Error fatal:', error)
  process.exit(1)
})

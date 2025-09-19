#!/usr/bin/env node

/**
 * Script para crear las tablas de notas y recordatorios de vehículos
 */

const { Pool } = require('pg')
const fs = require('fs')
const path = require('path')

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

async function setupTables() {
  log(colors.cyan + colors.bold, '🚀 CONFIGURANDO TABLAS DE VEHÍCULOS')
  log(colors.cyan, '=' .repeat(50))

  try {
    // Verificar conexión
    await pool.query('SELECT NOW()')
    log(colors.green, '✅ Conexión a base de datos exitosa')

    // Leer el archivo SQL
    const sqlPath = path.join(__dirname, 'create-vehiculo-tables.sql')
    if (!fs.existsSync(sqlPath)) {
      throw new Error(`Archivo SQL no encontrado: ${sqlPath}`)
    }

    const sqlContent = fs.readFileSync(sqlPath, 'utf8')
    log(colors.blue, '📄 Archivo SQL leído correctamente')

    // Ejecutar el SQL
    log(colors.yellow, '⚡ Ejecutando script SQL...')
    await pool.query(sqlContent)

    log(colors.green, '✅ Tablas creadas exitosamente:')
    log(colors.green, '   - VehiculoNotas')
    log(colors.green, '   - VehiculoRecordatorios')
    log(colors.green, '   - Índices para optimización')
    log(colors.green, '   - Datos de ejemplo insertados')

    // Verificar que las tablas existen
    const tablesResult = await pool.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      AND table_name IN ('vehiculonotas', 'vehiculorecordatorios')
      ORDER BY table_name
    `)

    log(colors.cyan, '\n📊 VERIFICACIÓN DE TABLAS:')
    tablesResult.rows.forEach(row => {
      log(colors.green, `   ✅ ${row.table_name}`)
    })

    // Mostrar conteo de registros
    const notasCount = await pool.query('SELECT COUNT(*) FROM VehiculoNotas')
    const recordatoriosCount = await pool.query('SELECT COUNT(*) FROM VehiculoRecordatorios')

    log(colors.cyan, '\n📈 REGISTROS INSERTADOS:')
    log(colors.green, `   📝 Notas: ${notasCount.rows[0].count}`)
    log(colors.green, `   ⏰ Recordatorios: ${recordatoriosCount.rows[0].count}`)

    log(colors.cyan + colors.bold, '\n🎉 CONFIGURACIÓN COMPLETADA EXITOSAMENTE!')
    log(colors.cyan, 'Las tablas están listas para usar en la página de detalle de vehículos.')

  } catch (error) {
    log(colors.red, '❌ Error durante la configuración:', error.message)
    console.error(error)
    process.exit(1)
  } finally {
    await pool.end()
  }
}

// Ejecutar configuración
setupTables().catch(error => {
  console.error('Error fatal:', error)
  process.exit(1)
})

#!/usr/bin/env node

/**
 * Script para agregar la columna garantiaPremium a la tabla Vehiculo
 *
 * Uso: node scripts/add-garantia-premium-column.js
 */

const { Pool } = require('pg')
const fs = require('fs')
const path = require('path')

// Cargar variables de entorno desde .env.local
function loadEnvFile() {
  try {
    const envPath = path.join(process.cwd(), '.env.local')
    if (fs.existsSync(envPath)) {
      const content = fs.readFileSync(envPath, 'utf8')
      const lines = content.split('\n')
      lines.forEach((line) => {
        const [key, ...valueParts] = line.split('=')
        if (key && valueParts.length > 0) {
          const value = valueParts.join('=').replace(/"/g, '').trim()
          if (key && value) {
            process.env[key.trim()] = value
          }
        }
      })
    }
  } catch (error) {
    console.error('Error cargando .env.local:', error)
  }
}

loadEnvFile()

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl:
    process.env.DATABASE_URL?.includes('supabase') ||
    process.env.DATABASE_URL?.includes('vercel')
      ? { rejectUnauthorized: false }
      : false,
})

async function addGarantiaPremiumColumn() {
  console.log('🚀 Agregando columna garantiaPremium a la tabla Vehiculo...')

  const client = await pool.connect()

  try {
    // Verificar si la columna ya existe
    const checkQuery = `
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'Vehiculo' 
      AND column_name = 'garantiaPremium'
    `
    const checkResult = await client.query(checkQuery)

    if (checkResult.rows.length > 0) {
      console.log(
        '✅ La columna garantiaPremium ya existe en la tabla Vehiculo'
      )
      return
    }

    // Agregar la columna
    console.log('📝 Creando columna garantiaPremium...')
    await client.query(`
      ALTER TABLE "Vehiculo" 
      ADD COLUMN "garantiaPremium" BOOLEAN DEFAULT false
    `)

    console.log('✅ Columna garantiaPremium agregada exitosamente!')
    console.log('')
    console.log('📊 Detalles:')
    console.log('   - Tabla: Vehiculo')
    console.log('   - Columna: garantiaPremium')
    console.log('   - Tipo: BOOLEAN')
    console.log('   - Valor por defecto: false')
    console.log('')
    console.log('🎉 ¡Base de datos actualizada correctamente!')
  } catch (error) {
    console.error('❌ Error agregando columna:', error.message)

    if (error.code === '42701') {
      console.log('ℹ️  La columna ya existe, esto es normal.')
    } else {
      console.error('🔧 Error técnico:', error)
      process.exit(1)
    }
  } finally {
    client.release()
    await pool.end()
  }
}

// Ejecutar script
addGarantiaPremiumColumn()
  .then(() => {
    console.log('✅ Script completado')
    process.exit(0)
  })
  .catch((error) => {
    console.error('❌ Error fatal:', error)
    process.exit(1)
  })

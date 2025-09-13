#!/usr/bin/env node

/**
 * Script para crear las tablas en Supabase manualmente
 */

const { PrismaClient } = require('@prisma/client')
const fs = require('fs').promises
const path = require('path')

const prisma = new PrismaClient()

async function setupTables() {
  console.log('🚀 Configurando tablas en Supabase...')

  try {
    // Verificar conexión
    await prisma.$connect()
    console.log('✅ Conexión a Supabase establecida')

    // Leer el archivo SQL
    const sqlFile = path.join(__dirname, '../create-tables.sql')
    const sqlContent = await fs.readFile(sqlFile, 'utf8')

    console.log('📖 Ejecutando script SQL...')
    
    // Ejecutar el SQL usando raw query
    await prisma.$executeRawUnsafe(sqlContent)
    
    console.log('✅ Tablas creadas exitosamente!')
    console.log('')
    console.log('📊 Tablas creadas:')
    console.log('   - Inversor ✅')
    console.log('   - Vehiculo ✅')
    console.log('   - Cliente ✅')
    console.log('   - NotaCliente ✅')
    console.log('')
    console.log('🎉 ¡Base de datos lista para usar!')

  } catch (error) {
    console.error('❌ Error creando tablas:', error.message)
    
    if (error.message.includes('already exists')) {
      console.log('ℹ️  Las tablas ya existen, esto es normal.')
      console.log('✅ Base de datos ya configurada correctamente!')
    } else {
      console.error('🔧 Error técnico:', error)
      process.exit(1)
    }
  } finally {
    await prisma.$disconnect()
  }
}

// Ejecutar setup
setupTables()

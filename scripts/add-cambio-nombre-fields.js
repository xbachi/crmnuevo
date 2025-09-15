const { Client } = require('pg')
const fs = require('fs')
const path = require('path')

// Cargar variables de entorno
require('dotenv').config({ path: '.env.local' })

async function addCambioNombreFields() {
  const client = new Client({
    connectionString: process.env.DATABASE_URL
  })

  try {
    await client.connect()
    console.log('🔗 Conectado a la base de datos')

    // Leer el archivo SQL
    const sqlPath = path.join(__dirname, '..', 'add-cambio-nombre-fields.sql')
    const sql = fs.readFileSync(sqlPath, 'utf8')

    // Ejecutar el SQL
    await client.query(sql)
    console.log('✅ Campos de cambio de nombre agregados exitosamente')

  } catch (error) {
    console.error('❌ Error:', error.message)
  } finally {
    await client.end()
  }
}

addCambioNombreFields()

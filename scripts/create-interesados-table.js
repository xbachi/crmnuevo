const { Pool } = require('pg')
const fs = require('fs')
const path = require('path')
require('dotenv').config({ path: '.env.local' })

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false,
  },
})

async function createInteresadosTable() {
  const client = await pool.connect()
  try {
    console.log('🔄 Creando tabla de interesados...')

    // Leer el archivo SQL
    const sqlPath = path.join(__dirname, 'create-interesados-table.sql')
    const sql = fs.readFileSync(sqlPath, 'utf8')

    // Ejecutar el SQL
    await client.query(sql)

    console.log('✅ Tabla de interesados creada exitosamente')

    // Verificar que la tabla existe
    const result = await client.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_name = 'interesados'
    `)

    if (result.rows.length > 0) {
      console.log('✅ Tabla interesados verificada en la base de datos')
    } else {
      console.log('❌ Error: La tabla no se creó correctamente')
    }
  } catch (error) {
    console.error('❌ Error creando tabla:', error.message)
    throw error
  } finally {
    client.release()
    await pool.end()
  }
}

createInteresadosTable()
  .then(() => {
    console.log('🎉 Proceso completado')
    process.exit(0)
  })
  .catch((error) => {
    console.error('❌ Error fatal:', error)
    process.exit(1)
  })

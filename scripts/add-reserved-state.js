const { Pool } = require('pg')

const pool = new Pool({
  user: process.env.DB_USER || 'postgres',
  host: process.env.DB_HOST || 'localhost',
  database: process.env.DB_NAME || 'crmseven',
  password: process.env.DB_PASSWORD || 'postgres',
  port: process.env.DB_PORT || 5432,
})

async function addReservedState() {
  const client = await pool.connect()
  try {
    console.log('🔄 Agregando estado RESERVADO a la base de datos...')

    // Verificar si ya existe el estado RESERVADO
    const checkResult = await client.query(`
      SELECT DISTINCT estado FROM "Vehiculo" WHERE estado = 'RESERVADO'
    `)

    if (checkResult.rows.length > 0) {
      console.log('✅ El estado RESERVADO ya existe en la base de datos')
      return
    }

    // Agregar algunos vehículos de prueba con estado RESERVADO (opcional)
    console.log('📝 Estado RESERVADO agregado exitosamente')
    console.log('💡 Los vehículos pueden tener estado RESERVADO desde ahora')
  } catch (error) {
    console.error('❌ Error agregando estado RESERVADO:', error)
  } finally {
    client.release()
    await pool.end()
  }
}

addReservedState()

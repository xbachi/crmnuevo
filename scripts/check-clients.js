const { Pool } = require('pg')
require('dotenv').config({ path: '.env.local' })

async function checkClients() {
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl:
      process.env.NODE_ENV === 'production'
        ? { rejectUnauthorized: false }
        : false,
  })

  try {
    console.log('🔍 Verificando clientes en la base de datos...\n')

    const result = await pool.query(
      'SELECT id, nombre, apellidos, email FROM "Cliente" ORDER BY id LIMIT 10'
    )

    if (result.rows.length === 0) {
      console.log('❌ No hay clientes en la base de datos')
      console.log('💡 Necesitas crear al menos un cliente antes de crear deals')
    } else {
      console.log(`✅ Encontrados ${result.rows.length} clientes:`)
      console.log('================================')
      result.rows.forEach((cliente) => {
        console.log(
          `- ID: ${cliente.id} | Nombre: ${cliente.nombre} ${cliente.apellidos} | Email: ${cliente.email}`
        )
      })
    }

    // También verificar vehículos
    console.log('\n🚗 Verificando vehículos en la base de datos...\n')
    const vehiculosResult = await pool.query(
      'SELECT id, marca, modelo, referencia, estado FROM "Vehiculo" ORDER BY id LIMIT 10'
    )

    if (vehiculosResult.rows.length === 0) {
      console.log('❌ No hay vehículos en la base de datos')
      console.log(
        '💡 Necesitas crear al menos un vehículo antes de crear deals'
      )
    } else {
      console.log(`✅ Encontrados ${vehiculosResult.rows.length} vehículos:`)
      console.log('================================')
      vehiculosResult.rows.forEach((vehiculo) => {
        console.log(
          `- ID: ${vehiculo.id} | ${vehiculo.marca} ${vehiculo.modelo} | Ref: ${vehiculo.referencia} | Estado: ${vehiculo.estado}`
        )
      })
    }
  } catch (error) {
    console.error('❌ Error verificando base de datos:', error.message)
  } finally {
    await pool.end()
  }
}

checkClients()

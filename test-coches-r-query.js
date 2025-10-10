const { Pool } = require('pg')

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false,
  },
})

async function testCochesRQuery() {
  try {
    console.log('🔍 Probando consulta de Coches R...')

    // Primero verificar qué tipos de vehículos existen
    const tiposResult = await pool.query(`
      SELECT DISTINCT tipo, COUNT(*) as count 
      FROM "Vehiculo" 
      GROUP BY tipo 
      ORDER BY tipo
    `)

    console.log('📊 Tipos de vehículos en la BD:')
    tiposResult.rows.forEach((row) => {
      console.log(`  - ${row.tipo}: ${row.count} vehículos`)
    })

    // Probar la consulta específica
    const result = await pool.query(`
      SELECT 
        id, referencia, marca, modelo, matricula, bastidor, color, año, 
        kms, "precioCompra", "precioVenta", estado, tipo, tipo_vehiculo,
        "fechaCompra", "fechaMatriculacion", combustible, cambio, potencia, 
        cilindrada, itv, "createdAt", "updatedAt"
      FROM "Vehiculo" 
      WHERE tipo = 'Coche R'
      ORDER BY "createdAt" DESC
    `)

    console.log(
      `✅ Consulta exitosa: ${result.rows.length} Coches R encontrados`
    )

    if (result.rows.length > 0) {
      console.log('📋 Primer Coche R:')
      console.log(JSON.stringify(result.rows[0], null, 2))
    }
  } catch (error) {
    console.error('❌ Error en la consulta:', error.message)
    console.error('Stack:', error.stack)
  } finally {
    await pool.end()
  }
}

testCochesRQuery()

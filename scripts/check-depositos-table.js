const { Pool } = require('pg')

const pool = new Pool({
  connectionString: 'postgresql://postgres:password@localhost:5432/crmseven',
})

async function checkTable() {
  try {
    console.log('🔍 Verificando estructura de la tabla depositos...')

    const result = await pool.query(`
      SELECT column_name, data_type, is_nullable, column_default
      FROM information_schema.columns 
      WHERE table_name = 'depositos' 
      ORDER BY ordinal_position
    `)

    console.log('📋 Estructura de la tabla depositos:')
    result.rows.forEach((row) => {
      console.log(
        `  - ${row.column_name}: ${row.data_type} (nullable: ${row.is_nullable}, default: ${row.column_default})`
      )
    })

    // Verificar si updated_at existe
    const hasUpdatedAt = result.rows.some(
      (row) => row.column_name === 'updated_at'
    )
    console.log(`\n📅 Campo updated_at existe: ${hasUpdatedAt}`)
  } catch (error) {
    console.error('❌ Error:', error.message)
  } finally {
    await pool.end()
  }
}

checkTable()

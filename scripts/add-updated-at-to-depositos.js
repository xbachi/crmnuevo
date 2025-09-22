const { Pool } = require('pg')

const pool = new Pool({
  connectionString:
    process.env.DATABASE_URL ||
    'postgresql://postgres:password@localhost:5432/crmseven',
})

async function addUpdatedAtColumn() {
  try {
    console.log(
      '🔍 Verificando si existe la columna updated_at en la tabla depositos...'
    )

    // Verificar si la columna existe
    const checkColumn = await pool.query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'depositos' 
      AND column_name = 'updated_at'
    `)

    if (checkColumn.rows.length === 0) {
      console.log('❌ La columna updated_at no existe. Creándola...')

      // Agregar la columna updated_at
      await pool.query(`
        ALTER TABLE depositos 
        ADD COLUMN updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      `)

      console.log('✅ Columna updated_at agregada exitosamente')

      // Actualizar todos los registros existentes con la fecha actual
      await pool.query(`
        UPDATE depositos 
        SET updated_at = CURRENT_TIMESTAMP 
        WHERE updated_at IS NULL
      `)

      console.log('✅ Registros existentes actualizados con fecha actual')
    } else {
      console.log('✅ La columna updated_at ya existe')
    }

    // Verificar la estructura de la tabla
    const tableStructure = await pool.query(`
      SELECT column_name, data_type, is_nullable, column_default
      FROM information_schema.columns 
      WHERE table_name = 'depositos' 
      ORDER BY ordinal_position
    `)

    console.log('📋 Estructura actual de la tabla depositos:')
    tableStructure.rows.forEach((row) => {
      console.log(
        `  - ${row.column_name}: ${row.data_type} (nullable: ${row.is_nullable}, default: ${row.column_default})`
      )
    })
  } catch (error) {
    console.error('❌ Error:', error)
  } finally {
    await pool.end()
  }
}

addUpdatedAtColumn()

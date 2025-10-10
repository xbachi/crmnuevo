const { Pool } = require('pg')

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false,
  },
})

async function addTipoVehiculoField() {
  try {
    console.log('🔧 Agregando campo tipo_vehiculo a la tabla Vehiculo...')

    // Verificar si el campo ya existe
    const checkResult = await pool.query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'Vehiculo' AND column_name = 'tipo_vehiculo'
    `)

    if (checkResult.rows.length > 0) {
      console.log('✅ El campo tipo_vehiculo ya existe')
    } else {
      // Agregar el campo
      await pool.query(`
        ALTER TABLE "Vehiculo" 
        ADD COLUMN tipo_vehiculo VARCHAR(20) DEFAULT 'normal'
      `)
      console.log('✅ Campo tipo_vehiculo agregado exitosamente')
    }

    // Actualizar vehículos existentes con tipo 'Coche R' para que tengan tipo_vehiculo = 'coche_r'
    const updateResult = await pool.query(`
      UPDATE "Vehiculo" 
      SET tipo_vehiculo = 'coche_r' 
      WHERE tipo = 'Coche R'
    `)

    console.log(
      `✅ Actualizados ${updateResult.rowCount} vehículos con tipo 'Coche R'`
    )

    // Crear índice
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_vehiculo_tipo_vehiculo ON "Vehiculo"(tipo_vehiculo)
    `)
    console.log('✅ Índice creado')
  } catch (error) {
    console.error('❌ Error:', error.message)
  } finally {
    await pool.end()
  }
}

addTipoVehiculoField()

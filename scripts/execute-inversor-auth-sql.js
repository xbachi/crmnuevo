const { Pool } = require('pg')
require('dotenv').config({ path: '.env.local' })

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
})

async function executeInversorAuthSQL() {
  const client = await pool.connect()
  try {
    console.log(
      'Ejecutando SQL para agregar campos de autenticación de inversores...'
    )

    const sqlQuery = `
      -- Agregar campos de autenticación a la tabla Inversor
      ALTER TABLE "Inversor" 
      ADD COLUMN IF NOT EXISTS usuario VARCHAR(255),
      ADD COLUMN IF NOT EXISTS contraseña VARCHAR(255);

      -- Crear índice único para el campo usuario
      CREATE UNIQUE INDEX IF NOT EXISTS idx_inversor_usuario ON "Inversor" (usuario) WHERE usuario IS NOT NULL;

      -- Comentarios para documentar los nuevos campos
      COMMENT ON COLUMN "Inversor".usuario IS 'Usuario para acceso del inversor a su página personal';
      COMMENT ON COLUMN "Inversor".contraseña IS 'Contraseña para acceso del inversor a su página personal';
    `

    await client.query(sqlQuery)
    console.log('✅ Campos de autenticación agregados a la tabla Inversor')
    console.log('✅ Índice único creado para el campo usuario')
    console.log('🎉 Script ejecutado correctamente')
  } catch (error) {
    console.error('Error ejecutando SQL para campos de autenticación:', error)
  } finally {
    client.release()
  }
}

executeInversorAuthSQL().catch(console.error)

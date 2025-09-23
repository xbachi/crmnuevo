const { Pool } = require('pg')
require('dotenv').config({ path: '../.env.local' })

const pool = new Pool({
  user: process.env.POSTGRES_USER,
  host: process.env.POSTGRES_HOST,
  database: process.env.POSTGRES_DATABASE,
  password: process.env.POSTGRES_PASSWORD,
  port: parseInt(process.env.POSTGRES_PORT || '5432'),
})

async function addActionTimestamps() {
  const client = await pool.connect()
  try {
    console.log(
      'Agregando campos de timestamp para acciones de cambio de nombre...'
    )

    // Agregar campos de timestamp individuales
    await client.query(`
      ALTER TABLE "Deal" 
      ADD COLUMN IF NOT EXISTS cambio_nombre_solicitado_at TIMESTAMP,
      ADD COLUMN IF NOT EXISTS documentacion_recibida_at TIMESTAMP,
      ADD COLUMN IF NOT EXISTS documentacion_retirada_at TIMESTAMP,
      ADD COLUMN IF NOT EXISTS cliente_avisado_at TIMESTAMP;
    `)

    console.log('✅ Campos de timestamp agregados exitosamente.')

    // Actualizar los timestamps existentes basándose en updatedAt
    console.log('Actualizando timestamps existentes...')

    await client.query(`
      UPDATE "Deal" 
      SET cambio_nombre_solicitado_at = updated_at
      WHERE cambio_nombre_solicitado = true 
      AND cambio_nombre_solicitado_at IS NULL;
    `)

    await client.query(`
      UPDATE "Deal" 
      SET documentacion_recibida_at = updated_at
      WHERE documentacion_recibida = true 
      AND documentacion_recibida_at IS NULL;
    `)

    await client.query(`
      UPDATE "Deal" 
      SET documentacion_retirada_at = updated_at
      WHERE documentacion_retirada = true 
      AND documentacion_retirada_at IS NULL;
    `)

    await client.query(`
      UPDATE "Deal" 
      SET cliente_avisado_at = updated_at
      WHERE cliente_avisado = true 
      AND cliente_avisado_at IS NULL;
    `)

    console.log('✅ Timestamps existentes actualizados.')
  } catch (error) {
    console.error('❌ Error agregando timestamps:', error)
  } finally {
    client.release()
  }
}

addActionTimestamps().catch(console.error)

const { Pool } = require('pg')
require('dotenv').config({ path: '.env.local' })

async function debugDealCreation() {
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl:
      process.env.NODE_ENV === 'production'
        ? { rejectUnauthorized: false }
        : false,
  })

  try {
    console.log('🔍 Debugging deal creation...\n')

    // Obtener un cliente y vehículo
    const clienteResult = await pool.query(
      'SELECT id, nombre, apellidos FROM "Cliente" LIMIT 1'
    )
    const vehiculoResult = await pool.query(
      'SELECT id, marca, modelo, referencia FROM "Vehiculo" LIMIT 1'
    )

    if (clienteResult.rows.length === 0 || vehiculoResult.rows.length === 0) {
      console.log('❌ No hay clientes o vehículos disponibles')
      return
    }

    const cliente = clienteResult.rows[0]
    const vehiculo = vehiculoResult.rows[0]

    console.log('👤 Cliente:', cliente)
    console.log('🚗 Vehículo:', vehiculo)

    // Verificar foreign keys
    console.log('\n🔍 Verificando foreign keys...')

    // Verificar que el cliente existe
    const clienteCheck = await pool.query(
      'SELECT id FROM "Cliente" WHERE id = $1',
      [cliente.id]
    )
    console.log('✅ Cliente existe:', clienteCheck.rows.length > 0)

    // Verificar que el vehículo existe
    const vehiculoCheck = await pool.query(
      'SELECT id FROM "Vehiculo" WHERE id = $1',
      [vehiculo.id]
    )
    console.log('✅ Vehículo existe:', vehiculoCheck.rows.length > 0)

    // Intentar crear el deal directamente
    console.log('\n📝 Intentando crear deal...')

    const year = new Date().getFullYear()
    const numero = `RES-${year}-${vehiculo.referencia || '0000'}`

    console.log('📋 Datos del deal:', {
      numero,
      clienteId: cliente.id,
      vehiculoId: vehiculo.id,
      estado: 'nuevo',
    })

    const result = await pool.query(
      `
      INSERT INTO "Deal" (
        numero, "clienteId", "vehiculoId", estado, "importeTotal", "importeSena", "formaPagoSena", observaciones, "responsableComercial"
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *
    `,
      [
        numero,
        cliente.id,
        vehiculo.id,
        'nuevo',
        25000,
        2000,
        'efectivo',
        'Deal de prueba para debug',
        'Usuario de Prueba',
      ]
    )

    console.log('✅ Deal creado exitosamente:', result.rows[0])
  } catch (error) {
    console.error('❌ Error:', error.message)
    console.error('📋 Detalles del error:', error)
  } finally {
    await pool.end()
  }
}

debugDealCreation()

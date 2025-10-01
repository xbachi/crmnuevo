const { Pool } = require('pg')

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
})

async function testVehiculosSearch() {
  try {
    console.log('🔍 Probando búsqueda de vehículos...')

    // 1. Verificar vehículos en la base de datos
    const allVehiculos = await pool.query(`
      SELECT id, referencia, marca, modelo, matricula, estado, tipo, "createdAt"
      FROM "Vehiculo" 
      ORDER BY "createdAt" DESC 
      LIMIT 10
    `)

    console.log(
      `📊 Total de vehículos encontrados: ${allVehiculos.rows.length}`
    )
    console.log('📋 Primeros 10 vehículos:')
    allVehiculos.rows.forEach((v, i) => {
      console.log(
        `${i + 1}. ${v.marca} ${v.modelo} - ${v.matricula} (${v.estado}) - Ref: ${v.referencia}`
      )
    })

    // 2. Verificar vehículos PUBLICADOS
    const publicados = await pool.query(`
      SELECT id, referencia, marca, modelo, matricula, estado, tipo, "createdAt"
      FROM "Vehiculo" 
      WHERE estado = 'PUBLICADO'
      ORDER BY "createdAt" DESC 
      LIMIT 10
    `)

    console.log(`\n📊 Vehículos PUBLICADOS: ${publicados.rows.length}`)
    publicados.rows.forEach((v, i) => {
      console.log(
        `${i + 1}. ${v.marca} ${v.modelo} - ${v.matricula} (${v.estado}) - Ref: ${v.referencia}`
      )
    })

    // 3. Verificar deals activos
    const dealsActivos = await pool.query(`
      SELECT id, "vehiculoId", estado, "createdAt"
      FROM "Deal" 
      WHERE estado IN ('reservado', 'vendido', 'facturado')
      ORDER BY "createdAt" DESC 
      LIMIT 10
    `)

    console.log(`\n📊 Deals activos: ${dealsActivos.rows.length}`)
    dealsActivos.rows.forEach((d, i) => {
      console.log(
        `${i + 1}. Deal ${d.id} - Vehículo ${d.vehiculoId} - Estado: ${d.estado}`
      )
    })

    // 4. Verificar vehículos disponibles (no reservados/vendidos)
    const vehiculosDisponibles = await pool.query(`
      SELECT v.id, v.referencia, v.marca, v.modelo, v.matricula, v.estado, v.tipo, v."createdAt"
      FROM "Vehiculo" v
      LEFT JOIN "Deal" d ON v.id = d."vehiculoId" 
        AND d.estado IN ('reservado', 'vendido', 'facturado')
      WHERE d.id IS NULL AND v.estado = 'PUBLICADO'
      ORDER BY v."createdAt" DESC 
      LIMIT 10
    `)

    console.log(
      `\n📊 Vehículos disponibles (no reservados/vendidos): ${vehiculosDisponibles.rows.length}`
    )
    vehiculosDisponibles.rows.forEach((v, i) => {
      console.log(
        `${i + 1}. ${v.marca} ${v.modelo} - ${v.matricula} (${v.estado}) - Ref: ${v.referencia}`
      )
    })

    // 5. Probar búsqueda por marca/modelo
    const searchTest = await pool.query(`
      SELECT id, referencia, marca, modelo, matricula, estado, tipo
      FROM "Vehiculo" 
      WHERE estado = 'PUBLICADO'
        AND (LOWER(marca || ' ' || modelo) LIKE '%toyota%' 
             OR LOWER(referencia) LIKE '%toyota%')
      ORDER BY "createdAt" DESC 
      LIMIT 5
    `)

    console.log(
      `\n🔍 Búsqueda por "toyota": ${searchTest.rows.length} resultados`
    )
    searchTest.rows.forEach((v, i) => {
      console.log(
        `${i + 1}. ${v.marca} ${v.modelo} - ${v.matricula} - Ref: ${v.referencia}`
      )
    })
  } catch (error) {
    console.error('❌ Error:', error)
  } finally {
    await pool.end()
  }
}

testVehiculosSearch()

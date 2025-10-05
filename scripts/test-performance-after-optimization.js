const { Pool } = require('pg')
const fs = require('fs')
const path = require('path')

// Cargar variables de entorno
function loadEnvFile() {
  try {
    const envPath = path.join(process.cwd(), '.env.local')
    if (fs.existsSync(envPath)) {
      const content = fs.readFileSync(envPath, 'utf8')
      const lines = content.split('\n')
      lines.forEach((line) => {
        const [key, value] = line.split('=')
        if (key && value) {
          process.env[key] = value.replace(/"/g, '')
        }
      })
    }
  } catch (error) {
    console.error('Error cargando .env.local:', error)
  }
}

loadEnvFile()

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false,
  },
})

async function testPerformance() {
  const client = await pool.connect()

  try {
    console.log('🚀 Probando rendimiento después de optimización...\n')

    // Test 1: Consulta de deals
    console.log('⏳ Probando consulta de deals...')
    const dealsStart = Date.now()
    const dealsResult = await client.query(`
      SELECT 
        d.id, d.numero, d."clienteId", d."vehiculoId", d.estado,
        d."importeTotal", d."importeSena", d."formaPagoSena",
        d."createdAt", d."updatedAt",
        c.nombre as cliente_nombre, c.apellidos as cliente_apellidos,
        v.referencia as vehiculo_referencia, v.marca as vehiculo_marca,
        v.modelo as vehiculo_modelo, v.matricula as vehiculo_matricula
      FROM "Deal" d
      LEFT JOIN "Cliente" c ON d."clienteId" = c.id
      LEFT JOIN "Vehiculo" v ON d."vehiculoId" = v.id
      ORDER BY d."createdAt" DESC
    `)
    const dealsTime = Date.now() - dealsStart
    console.log(
      `✅ Deals: ${dealsResult.rows.length} registros en ${dealsTime}ms`
    )

    // Test 2: Consulta de clientes
    console.log('⏳ Probando consulta de clientes...')
    const clientesStart = Date.now()
    const clientesResult = await client.query(`
      SELECT 
        id, nombre, apellidos, email, telefono, dni,
        direccion, ciudad, "codigoPostal", provincia, estado,
        "createdAt", "updatedAt"
      FROM "Cliente" 
      ORDER BY "createdAt" DESC
    `)
    const clientesTime = Date.now() - clientesStart
    console.log(
      `✅ Clientes: ${clientesResult.rows.length} registros en ${clientesTime}ms`
    )

    // Test 3: Consulta de vehículos
    console.log('⏳ Probando consulta de vehículos...')
    const vehiculosStart = Date.now()
    const vehiculosResult = await client.query(`
      SELECT 
        id, referencia, marca, modelo, matricula, bastidor, 
        kms, tipo, estado, color, "fechaMatriculacion", año,
        "precioPublicacion", "createdAt", "updatedAt"
      FROM "Vehiculo" 
      ORDER BY "createdAt" DESC
    `)
    const vehiculosTime = Date.now() - vehiculosStart
    console.log(
      `✅ Vehículos: ${vehiculosResult.rows.length} registros en ${vehiculosTime}ms`
    )

    // Test 4: Consulta con filtros (simulando búsqueda)
    console.log('⏳ Probando consulta con filtros...')
    const filtrosStart = Date.now()
    const filtrosResult = await client.query(`
      SELECT 
        id, referencia, marca, modelo, matricula, estado, tipo
      FROM "Vehiculo" 
      WHERE estado = 'PUBLICADO' AND tipo = 'Compra'
      ORDER BY "createdAt" DESC
      LIMIT 10
    `)
    const filtrosTime = Date.now() - filtrosStart
    console.log(
      `✅ Filtros: ${filtrosResult.rows.length} registros en ${filtrosTime}ms`
    )

    // Resumen
    console.log('\n📊 Resumen de rendimiento:')
    console.log('========================')
    console.log(
      `🔹 Deals: ${dealsTime}ms (${dealsResult.rows.length} registros)`
    )
    console.log(
      `🔹 Clientes: ${clientesTime}ms (${clientesResult.rows.length} registros)`
    )
    console.log(
      `🔹 Vehículos: ${vehiculosTime}ms (${vehiculosResult.rows.length} registros)`
    )
    console.log(
      `🔹 Filtros: ${filtrosTime}ms (${filtrosResult.rows.length} registros)`
    )

    const totalTime = dealsTime + clientesTime + vehiculosTime
    console.log(`\n⏱️  Tiempo total: ${totalTime}ms`)

    if (totalTime < 5000) {
      console.log('🎉 ¡Excelente! Rendimiento optimizado correctamente.')
    } else if (totalTime < 10000) {
      console.log('✅ Buen rendimiento, pero se puede mejorar más.')
    } else {
      console.log('⚠️  Rendimiento mejorado pero aún necesita optimización.')
    }

    // Verificar índices
    console.log('\n🔍 Verificando índices creados...')
    const indicesResult = await client.query(`
      SELECT 
        schemaname, tablename, indexname
      FROM pg_indexes 
      WHERE tablename IN ('Deal', 'Cliente', 'Vehiculo')
      ORDER BY tablename, indexname
    `)

    console.log(`📋 Índices encontrados: ${indicesResult.rows.length}`)
    indicesResult.rows.forEach((row) => {
      console.log(`  - ${row.tablename}.${row.indexname}`)
    })
  } catch (error) {
    console.error('❌ Error durante la prueba:', error)
  } finally {
    client.release()
    await pool.end()
  }
}

testPerformance()

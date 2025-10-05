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

async function testDealData() {
  const client = await pool.connect()

  try {
    console.log('🔍 Verificando datos de deals y vehículos...\n')

    // 1. Verificar si hay deals
    console.log('1. Verificando deals existentes...')
    const dealsResult = await client.query(
      'SELECT id, numero, "vehiculoId" FROM "Deal" ORDER BY id DESC LIMIT 5'
    )
    console.log(`   Encontrados ${dealsResult.rows.length} deals`)

    if (dealsResult.rows.length === 0) {
      console.log('❌ No hay deals para probar')
      return
    }

    const dealId = dealsResult.rows[0].id
    console.log(`   Probando con deal ID: ${dealId}`)

    // 2. Verificar datos del vehículo directamente
    console.log('\n2. Verificando datos del vehículo directamente...')
    const vehiculoResult = await client.query(
      `
      SELECT 
        id, referencia, marca, modelo, matricula, bastidor, kms,
        "fechaMatriculacion", año, "precioPublicacion", estado
      FROM "Vehiculo" 
      WHERE id = (SELECT "vehiculoId" FROM "Deal" WHERE id = $1)
    `,
      [dealId]
    )

    if (vehiculoResult.rows.length > 0) {
      const vehiculo = vehiculoResult.rows[0]
      console.log('   Datos del vehículo:')
      console.log(`   - ID: ${vehiculo.id}`)
      console.log(`   - Referencia: ${vehiculo.referencia}`)
      console.log(`   - Marca: ${vehiculo.marca}`)
      console.log(`   - Modelo: ${vehiculo.modelo}`)
      console.log(`   - Matrícula: ${vehiculo.matricula}`)
      console.log(`   - Fecha Matriculación: ${vehiculo.fechaMatriculacion}`)
      console.log(`   - Año: ${vehiculo.año}`)
      console.log(`   - Precio: ${vehiculo.precioPublicacion}`)
      console.log(`   - Estado: ${vehiculo.estado}`)
    } else {
      console.log('❌ No se encontró el vehículo')
    }

    // 3. Verificar datos del deal con JOIN
    console.log('\n3. Verificando datos del deal con JOIN...')
    const dealResult = await client.query(
      `
      SELECT 
        d.id, d.numero, d."vehiculoId",
        v.referencia as vehiculo_referencia,
        v.marca as vehiculo_marca,
        v.modelo as vehiculo_modelo,
        v.matricula as vehiculo_matricula,
        v."fechaMatriculacion" as vehiculo_fechaMatriculacion,
        v.año as vehiculo_año
      FROM "Deal" d
      LEFT JOIN "Vehiculo" v ON d."vehiculoId" = v.id
      WHERE d.id = $1
    `,
      [dealId]
    )

    if (dealResult.rows.length > 0) {
      const deal = dealResult.rows[0]
      console.log('   Datos del deal con JOIN:')
      console.log(`   - Deal ID: ${deal.id}`)
      console.log(`   - Número: ${deal.numero}`)
      console.log(`   - Vehículo ID: ${deal.vehiculoId}`)
      console.log(`   - Referencia: ${deal.vehiculo_referencia}`)
      console.log(`   - Marca: ${deal.vehiculo_marca}`)
      console.log(`   - Modelo: ${deal.vehiculo_modelo}`)
      console.log(`   - Matrícula: ${deal.vehiculo_matricula}`)
      console.log(
        `   - Fecha Matriculación: ${deal.vehiculo_fechaMatriculacion}`
      )
      console.log(`   - Año: ${deal.vehiculo_año}`)
    } else {
      console.log('❌ No se encontró el deal')
    }

    // 4. Verificar todos los vehículos con fechaMatriculacion
    console.log('\n4. Verificando vehículos con fechaMatriculacion...')
    const vehiculosConFecha = await client.query(`
      SELECT id, referencia, marca, modelo, "fechaMatriculacion", año
      FROM "Vehiculo" 
      WHERE "fechaMatriculacion" IS NOT NULL
      ORDER BY id DESC
      LIMIT 5
    `)

    console.log(
      `   Encontrados ${vehiculosConFecha.rows.length} vehículos con fechaMatriculacion`
    )
    vehiculosConFecha.rows.forEach((v, index) => {
      console.log(
        `   ${index + 1}. ${v.marca} ${v.modelo} - Fecha: ${v.fechaMatriculacion} - Año: ${v.año}`
      )
    })

    // 5. Verificar vehículos sin fechaMatriculacion
    console.log('\n5. Verificando vehículos sin fechaMatriculacion...')
    const vehiculosSinFecha = await client.query(`
      SELECT id, referencia, marca, modelo, "fechaMatriculacion", año
      FROM "Vehiculo" 
      WHERE "fechaMatriculacion" IS NULL
      ORDER BY id DESC
      LIMIT 5
    `)

    console.log(
      `   Encontrados ${vehiculosSinFecha.rows.length} vehículos sin fechaMatriculacion`
    )
    vehiculosSinFecha.rows.forEach((v, index) => {
      console.log(
        `   ${index + 1}. ${v.marca} ${v.modelo} - Fecha: ${v.fechaMatriculacion} - Año: ${v.año}`
      )
    })
  } catch (error) {
    console.error('❌ Error durante la verificación:', error)
  } finally {
    client.release()
    await pool.end()
  }
}

testDealData()

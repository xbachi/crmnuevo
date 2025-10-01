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

async function testJoinQuery() {
  const client = await pool.connect()

  try {
    console.log('🔍 Probando consulta con JOIN...\n')

    // Obtener el último deal
    const dealResult = await client.query(
      'SELECT id, "vehiculoId" FROM "Deal" ORDER BY id DESC LIMIT 1'
    )
    if (dealResult.rows.length === 0) {
      console.log('❌ No hay deals para probar')
      return
    }

    const dealId = dealResult.rows[0].id
    const vehiculoId = dealResult.rows[0].vehiculoId
    console.log(`Deal ID: ${dealId}, Vehículo ID: ${vehiculoId}`)

    // Probar consulta directa del vehículo
    console.log('\n1. Consulta directa del vehículo:')
    const vehiculoDirecto = await client.query(
      'SELECT id, marca, modelo, "fechaMatriculacion" FROM "Vehiculo" WHERE id = $1',
      [vehiculoId]
    )
    console.log(`   Resultado: ${JSON.stringify(vehiculoDirecto.rows[0])}`)

    // Probar JOIN simple
    console.log('\n2. JOIN simple:')
    const joinSimple = await client.query(
      `
      SELECT d.id, v.id as vehiculo_id, v.marca, v.modelo, v."fechaMatriculacion"
      FROM "Deal" d
      LEFT JOIN "Vehiculo" v ON d."vehiculoId" = v.id
      WHERE d.id = $1
    `,
      [dealId]
    )
    console.log(`   Resultado: ${JSON.stringify(joinSimple.rows[0])}`)

    // Probar con alias
    console.log('\n3. JOIN con alias:')
    const joinAlias = await client.query(
      `
      SELECT d.id, v.id as vehiculo_id, v.marca as vehiculo_marca, v.modelo as vehiculo_modelo, v."fechaMatriculacion" as vehiculo_fechaMatriculacion
      FROM "Deal" d
      LEFT JOIN "Vehiculo" v ON d."vehiculoId" = v.id
      WHERE d.id = $1
    `,
      [dealId]
    )
    console.log(`   Resultado: ${JSON.stringify(joinAlias.rows[0])}`)

    // Probar la consulta completa de getDealById
    console.log('\n4. Consulta completa de getDealById:')
    const consultaCompleta = await client.query(
      `
      SELECT 
        d.*,
        c.nombre as cliente_nombre,
        c.apellidos as cliente_apellidos,
        c.email as cliente_email,
        c.telefono as cliente_telefono,
        c.dni as cliente_dni,
        c.direccion as cliente_direccion,
        c.ciudad as cliente_ciudad,
        c.provincia as cliente_provincia,
        c."codigoPostal" as cliente_codPostal,
        v.referencia as vehiculo_referencia,
        v.marca as vehiculo_marca,
        v.modelo as vehiculo_modelo,
        v.matricula as vehiculo_matricula,
        v.bastidor as vehiculo_bastidor,
        v.kms as vehiculo_kms,
        v."precioPublicacion" as vehiculo_precio,
        v.estado as vehiculo_estado,
        v."fechaMatriculacion" as vehiculo_fechaMatriculacion,
        v.año as vehiculo_año
      FROM "Deal" d
      LEFT JOIN "Cliente" c ON d."clienteId" = c.id
      LEFT JOIN "Vehiculo" v ON d."vehiculoId" = v.id
      WHERE d.id = $1
    `,
      [dealId]
    )

    if (consultaCompleta.rows.length > 0) {
      const row = consultaCompleta.rows[0]
      console.log(
        `   vehiculo_fechaMatriculacion: ${row.vehiculo_fechaMatriculacion}`
      )
      console.log(`   vehiculo_marca: ${row.vehiculo_marca}`)
      console.log(`   vehiculo_modelo: ${row.vehiculo_modelo}`)

      // Verificar todas las columnas que empiezan con vehiculo_
      console.log('\n   Todas las columnas vehiculo_:')
      Object.keys(row).forEach((key) => {
        if (key.startsWith('vehiculo_')) {
          console.log(`   - ${key}: ${row[key]}`)
        }
      })
    }

    // Probar con diferentes formas de escribir la columna
    console.log('\n5. Probando diferentes formas de escribir la columna:')
    const formas = [
      'v."fechaMatriculacion"',
      'v.fechaMatriculacion',
      '"Vehiculo"."fechaMatriculacion"',
      'Vehiculo.fechaMatriculacion',
    ]

    for (const forma of formas) {
      try {
        const testQuery = `
          SELECT d.id, ${forma} as test_fecha
          FROM "Deal" d
          LEFT JOIN "Vehiculo" v ON d."vehiculoId" = v.id
          WHERE d.id = $1
        `
        const result = await client.query(testQuery, [dealId])
        console.log(`   ${forma}: ${result.rows[0].test_fecha}`)
      } catch (error) {
        console.log(`   ${forma}: ERROR - ${error.message}`)
      }
    }
  } catch (error) {
    console.error('❌ Error durante la prueba:', error)
  } finally {
    client.release()
    await pool.end()
  }
}

testJoinQuery()

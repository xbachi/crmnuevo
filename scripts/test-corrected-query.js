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

async function testCorrectedQuery() {
  const client = await pool.connect()

  try {
    console.log('🔍 Probando consulta corregida...\n')

    // Obtener el último deal
    const dealResult = await client.query(
      'SELECT id FROM "Deal" ORDER BY id DESC LIMIT 1'
    )
    if (dealResult.rows.length === 0) {
      console.log('❌ No hay deals para probar')
      return
    }

    const dealId = dealResult.rows[0].id
    console.log(`Probando con deal ID: ${dealId}`)

    // Probar la consulta corregida
    const result = await client.query(
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
        v."fechaMatriculacion" as "vehiculo_fechaMatriculacion",
        v.año as "vehiculo_año"
      FROM "Deal" d
      LEFT JOIN "Cliente" c ON d."clienteId" = c.id
      LEFT JOIN "Vehiculo" v ON d."vehiculoId" = v.id
      WHERE d.id = $1
    `,
      [dealId]
    )

    if (result.rows.length === 0) {
      console.log('❌ No se encontró el deal')
      return
    }

    const row = result.rows[0]
    console.log('\n📋 Datos raw de la consulta corregida:')
    console.log('=====================================')
    console.log(
      `vehiculo_fechaMatriculacion: ${row.vehiculo_fechaMatriculacion}`
    )
    console.log(`vehiculo_año: ${row.vehiculo_año}`)
    console.log(`vehiculo_marca: ${row.vehiculo_marca}`)
    console.log(`vehiculo_modelo: ${row.vehiculo_modelo}`)

    // Mostrar todas las columnas que empiezan con vehiculo_
    console.log('\n🔍 Todas las columnas vehiculo_:')
    Object.keys(row).forEach((key) => {
      if (key.startsWith('vehiculo_')) {
        console.log(`- ${key}: ${row[key]}`)
      }
    })

    // Simular el mapeo
    const vehiculo = {
      id: row.vehiculoId,
      referencia: row.vehiculo_referencia,
      marca: row.vehiculo_marca,
      modelo: row.vehiculo_modelo,
      matricula: row.vehiculo_matricula,
      bastidor: row.vehiculo_bastidor,
      kms: row.vehiculo_kms,
      precioPublicacion: row.vehiculo_precio,
      estado: row.vehiculo_estado,
      fechaMatriculacion: row.vehiculo_fechaMatriculacion,
      año: row.vehiculo_año,
    }

    console.log('\n🚗 Objeto vehículo mapeado:')
    console.log('===========================')
    console.log(JSON.stringify(vehiculo, null, 2))

    // Probar la función getFechaMatriculacion
    function getFechaMatriculacion(vehiculo) {
      if (vehiculo?.fechaMatriculacion) {
        const fecha = new Date(vehiculo.fechaMatriculacion)
        if (!isNaN(fecha.getTime())) {
          return fecha.toLocaleDateString('es-ES', {
            year: 'numeric',
            month: 'long',
            day: 'numeric',
          })
        }
      }
      return 'No especificada'
    }

    const fechaFormateada = getFechaMatriculacion(vehiculo)
    console.log(`\n📅 Fecha formateada: ${fechaFormateada}`)
  } catch (error) {
    console.error('❌ Error durante la prueba:', error)
  } finally {
    client.release()
    await pool.end()
  }
}

testCorrectedQuery()

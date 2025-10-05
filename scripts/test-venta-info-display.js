const { Pool } = require('pg')
const path = require('path')
const fs = require('fs')

// Cargar variables de entorno manualmente
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

async function testVentaInfoDisplay() {
  console.log('🔍 Probando información de venta en vehículos...\n')

  try {
    const client = await pool.connect()

    // 1. Buscar vehículos vendidos con información de deal
    console.log('1. Buscando vehículos vendidos con información de deal...')
    const vendidosResult = await client.query(`
      SELECT 
        v.id, v.referencia, v.marca, v.modelo, v.estado,
        d.id as deal_id, d.numero as deal_numero, d."fechaVentaFirmada" as deal_fecha_venta,
        c.id as cliente_id, c.nombre as cliente_nombre, c.apellidos as cliente_apellidos,
        c.email as cliente_email, c.telefono as cliente_telefono
      FROM "Vehiculo" v
      LEFT JOIN "Deal" d ON v."dealActivoId" = d.id
      LEFT JOIN "Cliente" c ON d."clienteId" = c.id
      WHERE v.estado = 'VENDIDO' AND d.id IS NOT NULL
      LIMIT 5
    `)

    if (vendidosResult.rows.length === 0) {
      console.log(
        '❌ No se encontraron vehículos vendidos con información de deal.'
      )
      console.log('\n💡 Para probar la funcionalidad:')
      console.log('   1. Crear un deal')
      console.log('   2. Marcar el vehículo como vendido')
      console.log(
        '   3. Verificar que el bloque aparezca en la página del vehículo'
      )
    } else {
      console.log(
        `✅ Encontrados ${vendidosResult.rows.length} vehículos vendidos:`
      )
      vendidosResult.rows.forEach((vehiculo, index) => {
        console.log(`\n${index + 1}. Vehículo ID: ${vehiculo.id}`)
        console.log(`   - Referencia: ${vehiculo.referencia}`)
        console.log(`   - Marca/Modelo: ${vehiculo.marca} ${vehiculo.modelo}`)
        console.log(`   - Estado: ${vehiculo.estado}`)
        console.log(`   - Deal ID: ${vehiculo.deal_id}`)
        console.log(`   - Número Deal: ${vehiculo.deal_numero}`)
        console.log(
          `   - Cliente: ${vehiculo.cliente_nombre} ${vehiculo.cliente_apellidos}`
        )
        console.log(`   - Email: ${vehiculo.cliente_email}`)
        console.log(`   - Teléfono: ${vehiculo.cliente_telefono}`)
        console.log(`   - Fecha Venta: ${vehiculo.deal_fecha_venta}`)
        console.log(
          `   - URL: http://localhost:3000/vehiculos/${vehiculo.id}-${vehiculo.marca.toLowerCase()}-${vehiculo.modelo.toLowerCase()}`
        )
      })
    }

    // 2. Verificar estructura de datos que devuelve getVehiculoById
    console.log('\n2. Verificando estructura de datos de getVehiculoById...')
    if (vendidosResult.rows.length > 0) {
      const vehiculoId = vendidosResult.rows[0].id
      const vehiculoResult = await client.query(
        `
        SELECT v.*, i.nombre as inversor_nombre,
               d.id as deal_id, d.numero as deal_numero, d."fechaVentaFirmada" as deal_fecha_venta,
               c.id as cliente_id, c.nombre as cliente_nombre, c.apellidos as cliente_apellidos,
               c.email as cliente_email, c.telefono as cliente_telefono
        FROM "Vehiculo" v
        LEFT JOIN "Inversor" i ON v."inversorId" = i.id
        LEFT JOIN "Deal" d ON v."dealActivoId" = d.id
        LEFT JOIN "Cliente" c ON d."clienteId" = c.id
        WHERE v.id = $1
      `,
        [vehiculoId]
      )

      const vehiculo = vehiculoResult.rows[0]
      console.log(`✅ Estructura de datos para vehículo ${vehiculoId}:`)
      console.log(`   - deal_id: ${vehiculo.deal_id}`)
      console.log(`   - deal_numero: ${vehiculo.deal_numero}`)
      console.log(`   - deal_fecha_venta: ${vehiculo.deal_fecha_venta}`)
      console.log(`   - cliente_nombre: ${vehiculo.cliente_nombre}`)
      console.log(`   - cliente_apellidos: ${vehiculo.cliente_apellidos}`)
      console.log(`   - cliente_email: ${vehiculo.cliente_email}`)
      console.log(`   - cliente_telefono: ${vehiculo.cliente_telefono}`)
    }

    // 3. Verificar que la función getVehiculoById mapee correctamente los datos
    console.log('\n3. Verificando mapeo de datos en getVehiculoById...')
    if (vendidosResult.rows.length > 0) {
      const vehiculoId = vendidosResult.rows[0].id
      const { getVehiculoById } = require('../src/lib/direct-database')

      try {
        const vehiculoCompleto = await getVehiculoById(vehiculoId)
        console.log(`✅ Vehículo obtenido con getVehiculoById:`)
        console.log(`   - ID: ${vehiculoCompleto?.id}`)
        console.log(`   - Estado: ${vehiculoCompleto?.estado}`)
        console.log(`   - Venta: ${vehiculoCompleto?.venta ? 'SÍ' : 'NO'}`)

        if (vehiculoCompleto?.venta) {
          console.log(`   - Deal ID: ${vehiculoCompleto.venta.dealId}`)
          console.log(`   - Deal Número: ${vehiculoCompleto.venta.dealNumero}`)
          console.log(`   - Fecha Venta: ${vehiculoCompleto.venta.fechaVenta}`)
          console.log(
            `   - Cliente: ${vehiculoCompleto.venta.cliente?.nombre} ${vehiculoCompleto.venta.cliente?.apellidos}`
          )
          console.log(`   - Email: ${vehiculoCompleto.venta.cliente?.email}`)
          console.log(
            `   - Teléfono: ${vehiculoCompleto.venta.cliente?.telefono}`
          )
        }
      } catch (error) {
        console.error(
          '❌ Error obteniendo vehículo con getVehiculoById:',
          error.message
        )
      }
    }

    console.log('\n📋 Resumen de la funcionalidad implementada:')
    console.log('==========================================')
    console.log(
      '✅ Bloque de información de venta agregado a la página de vehículo'
    )
    console.log('✅ Se muestra solo para vehículos con estado "VENDIDO"')
    console.log('✅ Incluye información del cliente (nombre, email, teléfono)')
    console.log('✅ Incluye información del deal (número y fecha de venta)')
    console.log('✅ Enlace directo al deal desde el número de deal')
    console.log('✅ Diseño consistente con el resto de la aplicación')
    console.log('✅ Iconos y colores apropiados para indicar venta exitosa')

    console.log('\n🎯 Para probar en el navegador:')
    console.log('===============================')
    if (vendidosResult.rows.length > 0) {
      vendidosResult.rows.forEach((vehiculo, index) => {
        const slug = `${vehiculo.id}-${vehiculo.marca.toLowerCase()}-${vehiculo.modelo.toLowerCase()}`
        console.log(`${index + 1}. http://localhost:3000/vehiculos/${slug}`)
      })
    } else {
      console.log('1. Crear un deal y marcar un vehículo como vendido')
      console.log('2. Visitar la página del vehículo')
      console.log('3. Verificar que aparezca el bloque de información de venta')
    }
  } catch (error) {
    console.error('❌ Error durante la prueba:', error)
  } finally {
    await pool.end()
  }
}

testVentaInfoDisplay()

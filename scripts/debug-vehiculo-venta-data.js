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

async function debugVehiculoVentaData() {
  console.log('🔍 Debugging datos de vehículo vendido...\n')

  try {
    const client = await pool.connect()

    // 1. Buscar vehículos con estado VENDIDO
    console.log('1. Buscando vehículos con estado VENDIDO...')
    const vendidosResult = await client.query(`
      SELECT id, referencia, marca, modelo, estado, "dealActivoId"
      FROM "Vehiculo" 
      WHERE estado = 'VENDIDO'
      LIMIT 5
    `)

    console.log(
      `Encontrados ${vendidosResult.rows.length} vehículos con estado VENDIDO:`
    )
    vendidosResult.rows.forEach((vehiculo, index) => {
      console.log(
        `${index + 1}. ID: ${vehiculo.id} - ${vehiculo.marca} ${vehiculo.modelo} - DealActivoId: ${vehiculo.dealActivoId}`
      )
    })

    if (vendidosResult.rows.length === 0) {
      console.log('\n❌ No hay vehículos con estado VENDIDO.')
      console.log(
        '💡 Vamos a buscar vehículos con otros estados relacionados con venta...'
      )

      const otrosEstadosResult = await client.query(`
        SELECT DISTINCT estado, COUNT(*) as count
        FROM "Vehiculo" 
        GROUP BY estado
        ORDER BY count DESC
      `)

      console.log('\nEstados disponibles en la base de datos:')
      otrosEstadosResult.rows.forEach((row) => {
        console.log(`- ${row.estado}: ${row.count} vehículos`)
      })

      // Buscar vehículos que tengan dealActivoId (pueden estar vendidos pero con otro estado)
      const conDealResult = await client.query(`
        SELECT v.id, v.referencia, v.marca, v.modelo, v.estado, v."dealActivoId",
               d.numero as deal_numero, d.estado as deal_estado
        FROM "Vehiculo" v
        LEFT JOIN "Deal" d ON v."dealActivoId" = d.id
        WHERE v."dealActivoId" IS NOT NULL
        LIMIT 5
      `)

      if (conDealResult.rows.length > 0) {
        console.log(
          `\n✅ Encontrados ${conDealResult.rows.length} vehículos con deal activo:`
        )
        conDealResult.rows.forEach((vehiculo, index) => {
          console.log(
            `${index + 1}. ID: ${vehiculo.id} - ${vehiculo.marca} ${vehiculo.modelo}`
          )
          console.log(`   Estado vehículo: ${vehiculo.estado}`)
          console.log(`   Deal ID: ${vehiculo.dealActivoId}`)
          console.log(`   Deal número: ${vehiculo.deal_numero}`)
          console.log(`   Deal estado: ${vehiculo.deal_estado}`)
        })
      }
    } else {
      // 2. Para cada vehículo vendido, verificar la información completa
      for (const vehiculo of vendidosResult.rows) {
        console.log(
          `\n2. Verificando datos completos para vehículo ${vehiculo.id}...`
        )

        const vehiculoCompletoResult = await client.query(
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
          [vehiculo.id]
        )

        const row = vehiculoCompletoResult.rows[0]
        console.log(`✅ Datos completos:`)
        console.log(`   - Estado: ${row.estado}`)
        console.log(`   - Deal ID: ${row.deal_id}`)
        console.log(`   - Deal número: ${row.deal_numero}`)
        console.log(`   - Fecha venta: ${row.deal_fecha_venta}`)
        console.log(`   - Cliente ID: ${row.cliente_id}`)
        console.log(`   - Cliente nombre: ${row.cliente_nombre}`)
        console.log(`   - Cliente apellidos: ${row.cliente_apellidos}`)
        console.log(`   - Cliente email: ${row.cliente_email}`)
        console.log(`   - Cliente teléfono: ${row.cliente_telefono}`)

        // 3. Verificar cómo se mapea en getVehiculoById
        console.log(`\n3. Verificando mapeo en getVehiculoById...`)
        const { getVehiculoById } = require('../src/lib/direct-database')

        try {
          const vehiculoMapeado = await getVehiculoById(vehiculo.id)
          console.log(`✅ Vehículo mapeado:`)
          console.log(`   - ID: ${vehiculoMapeado?.id}`)
          console.log(`   - Estado: ${vehiculoMapeado?.estado}`)
          console.log(
            `   - Tiene venta: ${vehiculoMapeado?.venta ? 'SÍ' : 'NO'}`
          )

          if (vehiculoMapeado?.venta) {
            console.log(`   - Venta dealId: ${vehiculoMapeado.venta.dealId}`)
            console.log(
              `   - Venta dealNumero: ${vehiculoMapeado.venta.dealNumero}`
            )
            console.log(
              `   - Venta fechaVenta: ${vehiculoMapeado.venta.fechaVenta}`
            )
            console.log(
              `   - Venta cliente: ${vehiculoMapeado.venta.cliente?.nombre} ${vehiculoMapeado.venta.cliente?.apellidos}`
            )
          } else {
            console.log(`❌ No se mapeó la información de venta`)
          }
        } catch (error) {
          console.error(`❌ Error en getVehiculoById:`, error.message)
        }

        // 4. Probar la condición del bloque
        console.log(`\n4. Probando condición del bloque...`)
        const estadoVendido = vehiculoMapeado?.estado === 'VENDIDO'
        const tieneVenta = !!vehiculoMapeado?.venta
        console.log(`   - vehiculo?.estado === 'VENDIDO': ${estadoVendido}`)
        console.log(`   - vehiculo?.venta: ${tieneVenta}`)
        console.log(`   - Condición completa: ${estadoVendido && tieneVenta}`)

        if (estadoVendido && tieneVenta) {
          console.log(`✅ El bloque DEBERÍA aparecer para este vehículo`)
          console.log(
            `   URL: http://localhost:3000/vehiculos/${vehiculo.id}-${vehiculo.marca.toLowerCase()}-${vehiculo.modelo.toLowerCase()}`
          )
        } else {
          console.log(`❌ El bloque NO aparecerá para este vehículo`)
          if (!estadoVendido)
            console.log(
              `   Razón: Estado no es VENDIDO (es: ${vehiculoMapeado?.estado})`
            )
          if (!tieneVenta)
            console.log(`   Razón: No tiene información de venta`)
        }

        break // Solo verificar el primero
      }
    }
  } catch (error) {
    console.error('❌ Error durante el debug:', error)
  } finally {
    await pool.end()
  }
}

debugVehiculoVentaData()

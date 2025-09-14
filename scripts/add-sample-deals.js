const { Pool } = require('pg')
require('dotenv').config()

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
})

async function addSampleDeals() {
  const client = await pool.connect()
  
  try {
    console.log('🚀 Agregando deals de ejemplo...')

    // Verificar si ya existen deals de ejemplo
    const existingDeals = await client.query('SELECT COUNT(*) FROM deals WHERE numero LIKE $1', ['DEAL-0000%'])
    
    if (existingDeals.rows[0].count > 0) {
      console.log('⚠️  Ya existen deals de ejemplo. Eliminando...')
      await client.query('DELETE FROM deals WHERE numero LIKE $1', ['DEAL-0000%'])
    }

    // Obtener algunos clientes y vehículos existentes
    const clientes = await client.query('SELECT id, nombre, apellidos, telefono FROM clientes LIMIT 5')
    const vehiculos = await client.query('SELECT id, marca, modelo, matricula, kms FROM vehiculos LIMIT 5')

    if (clientes.rows.length === 0) {
      console.log('❌ No hay clientes en la base de datos. Creando clientes de ejemplo...')
      
      const clientesEjemplo = [
        { nombre: 'Juan', apellidos: 'Pérez García', telefono: '666123456', email: 'juan.perez@email.com' },
        { nombre: 'María', apellidos: 'García López', telefono: '666234567', email: 'maria.garcia@email.com' },
        { nombre: 'Carlos', apellidos: 'López Martínez', telefono: '666345678', email: 'carlos.lopez@email.com' },
        { nombre: 'Ana', apellidos: 'Martínez Sánchez', telefono: '666456789', email: 'ana.martinez@email.com' },
        { nombre: 'Pedro', apellidos: 'Sánchez Fernández', telefono: '666567890', email: 'pedro.sanchez@email.com' }
      ]

      for (const cliente of clientesEjemplo) {
        await client.query(
          'INSERT INTO clientes (nombre, apellidos, telefono, email, "createdAt", "updatedAt") VALUES ($1, $2, $3, $4, NOW(), NOW())',
          [cliente.nombre, cliente.apellidos, cliente.telefono, cliente.email]
        )
      }

      // Volver a obtener los clientes
      const newClientes = await client.query('SELECT id, nombre, apellidos, telefono FROM clientes LIMIT 5')
      clientes.rows = newClientes.rows
    }

    if (vehiculos.rows.length === 0) {
      console.log('❌ No hay vehículos en la base de datos. Creando vehículos de ejemplo...')
      
      const vehiculosEjemplo = [
        { marca: 'BMW', modelo: 'X3', matricula: '1234ABC', kms: 45000, precio: 25500 },
        { marca: 'Audi', modelo: 'A4', matricula: '2345BCD', kms: 52000, precio: 18750 },
        { marca: 'Mercedes', modelo: 'C-Class', matricula: '3456CDE', kms: 38000, precio: 32200 },
        { marca: 'Volkswagen', modelo: 'Golf', matricula: '4567DEF', kms: 41000, precio: 15800 },
        { marca: 'Seat', modelo: 'León', matricula: '5678EFG', kms: 48000, precio: 12500 }
      ]

      for (const vehiculo of vehiculosEjemplo) {
        await client.query(
          'INSERT INTO vehiculos (marca, modelo, matricula, kms, precio, estado, "createdAt", "updatedAt") VALUES ($1, $2, $3, $4, $5, $6, NOW(), NOW())',
          [vehiculo.marca, vehiculo.modelo, vehiculo.matricula, vehiculo.kms, vehiculo.precio, 'disponible']
        )
      }

      // Volver a obtener los vehículos
      const newVehiculos = await client.query('SELECT id, marca, modelo, matricula, kms FROM vehiculos LIMIT 5')
      vehiculos.rows = newVehiculos.rows
    }

    // Crear deals de ejemplo
    const dealsEjemplo = [
      {
        numero: 'DEAL-00001',
        clienteId: clientes.rows[0].id,
        vehiculoId: vehiculos.rows[0].id,
        estado: 'nuevo',
        importeTotal: 25500,
        importeSena: 300,
        fechaCreacion: new Date('2024-05-10'),
        observaciones: 'Cliente interesado en BMW X3'
      },
      {
        numero: 'DEAL-00002',
        clienteId: clientes.rows[1].id,
        vehiculoId: vehiculos.rows[1].id,
        estado: 'reserva',
        importeTotal: 18750,
        importeSena: 500,
        fechaCreacion: new Date('2024-05-08'),
        fechaReservaDesde: new Date('2024-05-08'),
        observaciones: 'Reserva confirmada para Audi A4'
      },
      {
        numero: 'DEAL-00003',
        clienteId: clientes.rows[2].id,
        vehiculoId: vehiculos.rows[2].id,
        estado: 'venta',
        importeTotal: 32200,
        importeSena: 1000,
        fechaCreacion: new Date('2024-05-05'),
        fechaReservaDesde: new Date('2024-05-05'),
        fechaVenta: new Date('2024-05-07'),
        observaciones: 'Venta completada Mercedes C-Class'
      },
      {
        numero: 'DEAL-00004',
        clienteId: clientes.rows[3].id,
        vehiculoId: vehiculos.rows[3].id,
        estado: 'factura',
        importeTotal: 15800,
        importeSena: 300,
        fechaCreacion: new Date('2024-05-03'),
        fechaReservaDesde: new Date('2024-05-03'),
        fechaVenta: new Date('2024-05-05'),
        fechaFactura: new Date('2024-05-06'),
        observaciones: 'Facturado Volkswagen Golf'
      },
      {
        numero: 'DEAL-00005',
        clienteId: clientes.rows[4].id,
        vehiculoId: vehiculos.rows[4].id,
        estado: 'nuevo',
        importeTotal: 12500,
        importeSena: 200,
        fechaCreacion: new Date('2024-05-01'),
        observaciones: 'Nuevo deal para Seat León'
      }
    ]

    for (const deal of dealsEjemplo) {
      await client.query(`
        INSERT INTO deals (
          numero, "clienteId", "vehiculoId", estado, "importeTotal", "importeSena",
          "fechaCreacion", "fechaReservaDesde", "fechaVenta", "fechaFactura",
          observaciones, "createdAt", "updatedAt"
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, NOW(), NOW())
      `, [
        deal.numero,
        deal.clienteId,
        deal.vehiculoId,
        deal.estado,
        deal.importeTotal,
        deal.importeSena,
        deal.fechaCreacion,
        deal.fechaReservaDesde || null,
        deal.fechaVenta || null,
        deal.fechaFactura || null,
        deal.observaciones
      ])

      console.log(`✅ Deal creado: ${deal.numero} - ${deal.estado}`)
    }

    console.log('🎉 ¡Deals de ejemplo agregados exitosamente!')
    
    // Mostrar resumen
    const resumen = await client.query(`
      SELECT estado, COUNT(*) as cantidad 
      FROM deals 
      WHERE numero LIKE 'DEAL-0000%'
      GROUP BY estado
    `)
    
    console.log('\n📊 Resumen de deals creados:')
    resumen.rows.forEach(row => {
      console.log(`   ${row.estado}: ${row.cantidad} deals`)
    })

  } catch (error) {
    console.error('❌ Error agregando deals de ejemplo:', error)
  } finally {
    client.release()
    await pool.end()
  }
}

addSampleDeals()

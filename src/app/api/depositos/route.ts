import { NextRequest, NextResponse } from 'next/server'
import { pool } from '@/lib/direct-database'

export async function GET() {
  try {
    const result = await pool.query(`
      SELECT 
        d.*,
        c.id as cliente_id, c.nombre, c.apellidos, c.email, c.telefono,
        v.id as vehiculo_id, v.referencia, v.marca, v.modelo, v.matricula, v.tipo
      FROM depositos d
      JOIN "Cliente" c ON d.cliente_id = c.id
      JOIN "Vehiculo" v ON d.vehiculo_id = v.id
      ORDER BY d.created_at DESC
    `)

    const depositos = result.rows.map((row) => ({
      id: row.id,
      cliente_id: row.cliente_id,
      vehiculo_id: row.vehiculo_id,
      estado: row.estado,
      fecha_inicio: row.fecha_inicio,
      fecha_fin: row.fecha_fin,
      precio_venta: row.precio_venta,
      comision_porcentaje: row.comision_porcentaje,
      notas: row.notas,
      monto_recibir: row.monto_recibir,
      dias_gestion: row.dias_gestion,
      multa_retiro_anticipado: row.multa_retiro_anticipado,
      numero_cuenta: row.numero_cuenta,
      created_at: row.created_at,
      cliente: {
        id: row.cliente_id,
        nombre: row.nombre,
        apellidos: row.apellidos,
        email: row.email,
        telefono: row.telefono,
        dni: '', // Campo no disponible en la BD
        direccion: '', // Campo no disponible en la BD
        ciudad: '', // Campo no disponible en la BD
        provincia: '', // Campo no disponible en la BD
        codPostal: '', // Campo no disponible en la BD
      },
      vehiculo: {
        id: row.vehiculo_id,
        referencia: row.referencia,
        marca: row.marca,
        modelo: row.modelo,
        matricula: row.matricula,
        tipo: row.tipo,
        bastidor: '', // Campo no disponible en la BD
        kms: 0, // Campo no disponible en la BD
        fechaMatriculacion: '', // Campo no disponible en la BD
      },
    }))

    return NextResponse.json(depositos)
  } catch (error) {
    console.error('Error fetching depositos:', error)
    return NextResponse.json(
      { error: 'Error interno del servidor' },
      { status: 500 }
    )
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const {
      cliente_id,
      vehiculo_id,
      estado = 'BORRADOR',
      fecha_inicio,
      precio_venta,
      comision_porcentaje = 5.0,
      notas,
      monto_recibir,
      dias_gestion,
      multa_retiro_anticipado,
      numero_cuenta,
    } = body

    console.log('📥 Recibiendo datos de depósito:', {
      cliente_id,
      vehiculo_id,
      estado,
      fecha_inicio,
      precio_venta,
      comision_porcentaje,
      notas,
      monto_recibir,
      dias_gestion,
      multa_retiro_anticipado,
      numero_cuenta,
    })

    // Validar que no exista un depósito activo para este vehículo
    const existingDeposito = await pool.query(
      'SELECT id FROM depositos WHERE vehiculo_id = $1 AND estado = $2',
      [vehiculo_id, 'ACTIVO']
    )

    console.log(
      '🔍 Depósitos existentes para vehículo',
      vehiculo_id,
      ':',
      existingDeposito.rows
    )

    if (existingDeposito.rows.length > 0) {
      console.log('⚠️ Ya existe un depósito activo para este vehículo')
      return NextResponse.json(
        { error: 'Ya existe un depósito activo para este vehículo' },
        { status: 400 }
      )
    }

    // Calcular fecha de fin si se proporcionan días de gestión
    let fecha_fin = null
    if (dias_gestion) {
      const fechaInicio = new Date(fecha_inicio)
      fechaInicio.setDate(fechaInicio.getDate() + parseInt(dias_gestion))
      fecha_fin = fechaInicio.toISOString().split('T')[0]
    }

    console.log('💾 Insertando nuevo depósito...')
    const result = await pool.query(
      `
      INSERT INTO depositos (cliente_id, vehiculo_id, estado, fecha_inicio, fecha_fin, precio_venta, comision_porcentaje, notas, monto_recibir, dias_gestion, multa_retiro_anticipado, numero_cuenta)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
      RETURNING *
    `,
      [
        cliente_id,
        vehiculo_id,
        estado,
        fecha_inicio,
        fecha_fin,
        precio_venta,
        comision_porcentaje,
        notas,
        monto_recibir,
        dias_gestion,
        multa_retiro_anticipado,
        numero_cuenta,
      ]
    )

    console.log('✅ Depósito creado exitosamente:', result.rows[0])
    return NextResponse.json(result.rows[0], { status: 201 })
  } catch (error) {
    console.error('❌ Error creating deposito:', error)
    return NextResponse.json(
      { error: 'Error interno del servidor' },
      { status: 500 }
    )
  }
}

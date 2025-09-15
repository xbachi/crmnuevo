import { NextRequest, NextResponse } from 'next/server'
import { pool } from '@/lib/database'

export async function GET() {
  try {
    const result = await pool.query(`
      SELECT 
        d.*,
        c.id as cliente_id, c.nombre, c.apellidos, c.email, c.telefono,
        v.id as vehiculo_id, v.referencia, v.marca, v.modelo, v.matricula, v.tipo
      FROM depositos d
      JOIN clientes c ON d.cliente_id = c.id
      JOIN vehiculos v ON d.vehiculo_id = v.id
      ORDER BY d.created_at DESC
    `)

    const depositos = result.rows.map(row => ({
      id: row.id,
      cliente_id: row.cliente_id,
      vehiculo_id: row.vehiculo_id,
      estado: row.estado,
      fecha_inicio: row.fecha_inicio,
      fecha_fin: row.fecha_fin,
      precio_venta: row.precio_venta,
      comision_porcentaje: row.comision_porcentaje,
      notas: row.notas,
      created_at: row.created_at,
      cliente: {
        id: row.cliente_id,
        nombre: row.nombre,
        apellidos: row.apellidos,
        email: row.email,
        telefono: row.telefono
      },
      vehiculo: {
        id: row.vehiculo_id,
        referencia: row.referencia,
        marca: row.marca,
        modelo: row.modelo,
        matricula: row.matricula,
        tipo: row.tipo
      }
    }))

    return NextResponse.json(depositos)
  } catch (error) {
    console.error('Error fetching depositos:', error)
    return NextResponse.json({ error: 'Error interno del servidor' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { cliente_id, vehiculo_id, estado = 'BORRADOR', fecha_inicio, precio_venta, comision_porcentaje = 5.0, notas } = body

    // Validar que no exista un depósito activo para este vehículo
    const existingDeposito = await pool.query(
      'SELECT id FROM depositos WHERE vehiculo_id = $1 AND estado = $2',
      [vehiculo_id, 'ACTIVO']
    )

    if (existingDeposito.rows.length > 0) {
      return NextResponse.json({ error: 'Ya existe un depósito activo para este vehículo' }, { status: 400 })
    }

    const result = await pool.query(`
      INSERT INTO depositos (cliente_id, vehiculo_id, estado, fecha_inicio, precio_venta, comision_porcentaje, notas)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING *
    `, [cliente_id, vehiculo_id, estado, fecha_inicio, precio_venta, comision_porcentaje, notas])

    return NextResponse.json(result.rows[0], { status: 201 })
  } catch (error) {
    console.error('Error creating deposito:', error)
    return NextResponse.json({ error: 'Error interno del servidor' }, { status: 500 })
  }
}

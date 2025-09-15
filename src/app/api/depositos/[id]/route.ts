import { NextRequest, NextResponse } from 'next/server'
import { pool } from '@/lib/direct-database'

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const result = await pool.query(`
      SELECT 
        d.*,
        c.id as cliente_id, c.nombre, c.apellidos, c.email, c.telefono,
        v.id as vehiculo_id, v.referencia, v.marca, v.modelo, v.matricula, v.tipo
      FROM depositos d
      JOIN "Cliente" c ON d.cliente_id = c.id
      JOIN "Vehiculo" v ON d.vehiculo_id = v.id
      WHERE d.id = $1
    `, [id])

    if (result.rows.length === 0) {
      return NextResponse.json({ error: 'Depósito no encontrado' }, { status: 404 })
    }

    const row = result.rows[0]
    const deposito = {
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
    }

    return NextResponse.json(deposito)
  } catch (error) {
    console.error('Error fetching deposito:', error)
    return NextResponse.json({ error: 'Error interno del servidor' }, { status: 500 })
  }
}

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const body = await request.json()
    const { estado, fecha_fin, precio_venta, comision_porcentaje, notas } = body

    const result = await pool.query(`
      UPDATE depositos 
      SET estado = $1, fecha_fin = $2, precio_venta = $3, comision_porcentaje = $4, notas = $5, updated_at = CURRENT_TIMESTAMP
      WHERE id = $6
      RETURNING *
    `, [estado, fecha_fin, precio_venta, comision_porcentaje, notas, id])

    if (result.rows.length === 0) {
      return NextResponse.json({ error: 'Depósito no encontrado' }, { status: 404 })
    }

    return NextResponse.json(result.rows[0])
  } catch (error) {
    console.error('Error updating deposito:', error)
    return NextResponse.json({ error: 'Error interno del servidor' }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const result = await pool.query('DELETE FROM depositos WHERE id = $1 RETURNING *', [id])

    if (result.rows.length === 0) {
      return NextResponse.json({ error: 'Depósito no encontrado' }, { status: 404 })
    }

    return NextResponse.json({ message: 'Depósito eliminado exitosamente' })
  } catch (error) {
    console.error('Error deleting deposito:', error)
    return NextResponse.json({ error: 'Error interno del servidor' }, { status: 500 })
  }
}

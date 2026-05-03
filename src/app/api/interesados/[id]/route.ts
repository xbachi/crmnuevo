import { NextRequest, NextResponse } from 'next/server'
import { pool } from '@/lib/direct-database'
import { handleDeleteError } from '@/lib/api-errors'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: idParam } = await params
  const id = parseInt(idParam)
  if (isNaN(id)) {
    return NextResponse.json(
      { error: 'ID de interesado inválido' },
      { status: 400 }
    )
  }

  try {
    const client = await pool.connect()
    try {
      const result = await client.query(
        'SELECT * FROM interesados WHERE id = $1',
        [id]
      )

      if (result.rows.length === 0) {
        return NextResponse.json(
          { error: 'Interesado no encontrado' },
          { status: 404 }
        )
      }

      // Mapear nombres de columnas de snake_case a camelCase
      const row = result.rows[0]
      const mappedRow = {
        id: row.id,
        nombre: row.nombre,
        apellidos: row.apellidos,
        telefono: row.telefono,
        vehiculosInteres: row.vehiculosinteres || row.vehiculosInteres,
        presupuestoMaximo: row.presupuestomaximo || row.presupuestoMaximo,
        kilometrajeMaximo: row.kilometrajemaximo || row.kilometrajeMaximo,
        añoMinimo: row.añominimo || row.añoMinimo,
        combustiblePreferido:
          row.combustiblepreferido || row.combustiblePreferido,
        cambioPreferido: row.cambiopreferido || row.cambioPreferido,
        formaPagoPreferida: row.formapagopreferida || row.formaPagoPreferida,
        createdAt: row.createdat || row.createdAt,
        updatedAt: row.updatedat || row.updatedAt,
      }

      return NextResponse.json(mappedRow)
    } finally {
      client.release()
    }
  } catch (error) {
    console.error('Error al obtener interesado:', error)
    return NextResponse.json(
      { error: 'Error interno del servidor' },
      { status: 500 }
    )
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: idParam } = await params
  const id = parseInt(idParam)
  if (isNaN(id)) {
    return NextResponse.json(
      { error: 'ID de interesado inválido' },
      { status: 400 }
    )
  }

  try {
    const data = await request.json()
    const client = await pool.connect()
    try {
      const fields: string[] = []
      const values: any[] = []

      const push = (col: string, val: any) => {
        fields.push(`${col} = $${fields.length + 1}`)
        values.push(val)
      }

      if (data.nombre !== undefined) push('nombre', data.nombre)
      if (data.apellidos !== undefined) push('apellidos', data.apellidos)
      if (data.telefono !== undefined) push('telefono', data.telefono)
      if (data.vehiculosInteres !== undefined)
        push('vehiculosInteres', data.vehiculosInteres)
      if (data.presupuestoMaximo !== undefined)
        push('presupuestoMaximo', data.presupuestoMaximo)
      if (data.kilometrajeMaximo !== undefined)
        push('kilometrajeMaximo', data.kilometrajeMaximo)
      if (data.añoMinimo !== undefined) push('"añoMinimo"', data.añoMinimo)
      if (data.combustiblePreferido !== undefined)
        push('combustiblePreferido', data.combustiblePreferido)
      if (data.cambioPreferido !== undefined)
        push('cambioPreferido', data.cambioPreferido)
      if (data.formaPagoPreferida !== undefined)
        push('formaPagoPreferida', data.formaPagoPreferida)

      if (fields.length === 0) {
        return NextResponse.json({ error: 'Sin cambios' }, { status: 400 })
      }

      const result = await client.query(
        `UPDATE interesados SET ${fields.join(', ')}, "updatedAt" = NOW() WHERE id = $${fields.length + 1} RETURNING *`,
        [...values, id]
      )

      if (result.rows.length === 0) {
        return NextResponse.json(
          { error: 'Interesado no encontrado' },
          { status: 404 }
        )
      }

      // Mapear nombres de columnas de snake_case a camelCase
      const row = result.rows[0]
      const mappedRow = {
        id: row.id,
        nombre: row.nombre,
        apellidos: row.apellidos,
        telefono: row.telefono,
        vehiculosInteres: row.vehiculosinteres || row.vehiculosInteres,
        presupuestoMaximo: row.presupuestomaximo || row.presupuestoMaximo,
        kilometrajeMaximo: row.kilometrajemaximo || row.kilometrajeMaximo,
        añoMinimo: row.añominimo || row.añoMinimo,
        combustiblePreferido:
          row.combustiblepreferido || row.combustiblePreferido,
        cambioPreferido: row.cambiopreferido || row.cambioPreferido,
        formaPagoPreferida: row.formapagopreferida || row.formaPagoPreferida,
        createdAt: row.createdat || row.createdAt,
        updatedAt: row.updatedat || row.updatedAt,
      }

      return NextResponse.json(mappedRow)
    } finally {
      client.release()
    }
  } catch (error: any) {
    console.error('Error al actualizar interesado:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: idParam } = await params
  const id = parseInt(idParam)
  if (isNaN(id)) {
    return NextResponse.json(
      { error: 'ID de interesado inválido' },
      { status: 400 }
    )
  }

  try {
    const client = await pool.connect()
    try {
      const result = await client.query(
        'DELETE FROM interesados WHERE id = $1 RETURNING id',
        [id]
      )

      if (result.rows.length === 0) {
        return NextResponse.json(
          { error: 'Interesado no encontrado' },
          { status: 404 }
        )
      }

      return NextResponse.json({ success: true })
    } finally {
      client.release()
    }
  } catch (error) {
    return handleDeleteError(error, 'interesado')
  }
}

import { NextRequest, NextResponse } from 'next/server'
import { pool } from '@/lib/direct-database'

export async function GET() {
  try {
    const client = await pool.connect()
    try {
      const result = await client.query(
        `SELECT * FROM interesados ORDER BY "createdAt" DESC`
      )
      return NextResponse.json(result.rows)
    } finally {
      client.release()
    }
  } catch (error) {
    return NextResponse.json(
      { error: 'Error al cargar interesados' },
      { status: 500 }
    )
  }
}

export async function POST(request: NextRequest) {
  try {
    const data = await request.json()

    if (!data.nombre || !data.apellidos || !data.telefono) {
      return NextResponse.json(
        { error: 'Nombre, apellidos y teléfono son obligatorios' },
        { status: 400 }
      )
    }

    const client = await pool.connect()
    try {
      const result = await client.query(
        `INSERT INTO interesados (
          nombre, apellidos, telefono,
          vehiculosInteres, presupuestoMaximo, kilometrajeMaximo, "añoMinimo",
          combustiblePreferido, cambioPreferido, formaPagoPreferida,
          "createdAt", "updatedAt"
        ) VALUES (
          $1, $2, $3,
          $4, $5, $6, $7,
          $8, $9, $10,
          NOW(), NOW()
        ) RETURNING *`,
        [
          data.nombre.trim(),
          data.apellidos.trim(),
          data.telefono.trim(),
          data.vehiculosInteres || null,
          data.presupuestoMaximo || null,
          data.kilometrajeMaximo || null,
          data.añoMinimo || null,
          data.combustiblePreferido || 'cualquiera',
          data.cambioPreferido || 'cualquiera',
          data.formaPagoPreferida || 'cualquiera',
        ]
      )
      return NextResponse.json(result.rows[0], { status: 201 })
    } finally {
      client.release()
    }
  } catch (error) {
    return NextResponse.json(
      { error: 'Error creando interesado' },
      { status: 500 }
    )
  }
}

export async function PUT(request: NextRequest) {
  try {
    const data = await request.json()
    const { id } = data
    if (!id)
      return NextResponse.json({ error: 'ID requerido' }, { status: 400 })

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

    if (fields.length === 0)
      return NextResponse.json({ error: 'Sin cambios' }, { status: 400 })

    const client = await pool.connect()
    try {
      const result = await client.query(
        `UPDATE interesados SET ${fields.join(', ')}, "updatedAt" = NOW() WHERE id = $${fields.length + 1} RETURNING *`,
        [...values, id]
      )
      if (result.rows.length === 0)
        return NextResponse.json({ error: 'No encontrado' }, { status: 404 })
      return NextResponse.json(result.rows[0])
    } finally {
      client.release()
    }
  } catch (error) {
    return NextResponse.json(
      { error: 'Error actualizando interesado' },
      { status: 500 }
    )
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const id = searchParams.get('id')
    if (!id)
      return NextResponse.json({ error: 'ID requerido' }, { status: 400 })
    const result = await pool.query(
      'DELETE FROM interesados WHERE id = $1 RETURNING id',
      [id]
    )
    if (result.rows.length === 0)
      return NextResponse.json({ error: 'No encontrado' }, { status: 404 })
    return NextResponse.json({ success: true })
  } catch (error) {
    return NextResponse.json(
      { error: 'Error eliminando interesado' },
      { status: 500 }
    )
  }
}

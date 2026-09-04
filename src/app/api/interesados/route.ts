import { NextRequest, NextResponse } from 'next/server'
import { getInteresadosPage, pool } from '@/lib/direct-database'
import { construirPagination, leerPaginacion } from '@/lib/listPagination'

export async function GET(request: NextRequest) {
  try {
    // Con ?page= se pagina en SQL ({ interesados, pagination }); sin page,
    // el array completo de siempre.
    const paginacion = leerPaginacion(new URL(request.url).searchParams)
    if (paginacion) {
      const { page, limit, offset, q } = paginacion
      const { rows, total } = await getInteresadosPage({ limit, offset, q })
      return NextResponse.json({
        interesados: rows,
        pagination: construirPagination(total, page, limit),
      })
    }

    const client = await pool.connect()
    try {
      const result = await client.query(
        `SELECT * FROM interesados ORDER BY "createdAt" DESC`
      )

      // Mapear nombres de columnas de snake_case/camelCase a camelCase
      const mappedRows = result.rows.map((row) => ({
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
      }))

      return NextResponse.json(mappedRows)
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
    console.log('📥 [API POST] Datos recibidos:', JSON.stringify(data, null, 2))

    if (!data.nombre || !data.apellidos || !data.telefono) {
      return NextResponse.json(
        { error: 'Nombre, apellidos y teléfono son obligatorios' },
        { status: 400 }
      )
    }

    const client = await pool.connect()
    try {
      console.log('📥 [API POST] vehiculosInteres:', data.vehiculosInteres)
      console.log('📥 [API POST] tipo:', typeof data.vehiculosInteres)

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
      console.log('✅ [API POST] Interesado creado:', result.rows[0])

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

      return NextResponse.json(mappedRow, { status: 201 })
    } finally {
      client.release()
    }
  } catch (error) {
    console.error('❌ [API POST] Error:', error)
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

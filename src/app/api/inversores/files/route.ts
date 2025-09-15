import { NextRequest, NextResponse } from 'next/server'
import { pool } from '@/lib/direct-database'

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const inversorId = searchParams.get('inversorId')

    if (!inversorId) {
      return NextResponse.json(
        { error: 'ID de inversor es requerido' },
        { status: 400 }
      )
    }

    const client = await pool.connect()
    try {
      const result = await client.query(`
        SELECT 
          id,
          nombre,
          url,
          tipo,
          tamaño,
          descripcion,
          "fechaSubida"
        FROM "InversorArchivo"
        WHERE "inversorId" = $1
        ORDER BY "fechaSubida" DESC
      `, [inversorId])

      return NextResponse.json({
        success: true,
        files: result.rows
      })

    } finally {
      client.release()
    }

  } catch (error) {
    console.error('Error al obtener archivos:', error)
    return NextResponse.json(
      { error: 'Error interno del servidor' },
      { status: 500 }
    )
  }
}

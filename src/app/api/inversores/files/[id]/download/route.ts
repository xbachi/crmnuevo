import { NextRequest, NextResponse } from 'next/server'
import { readFile } from 'fs/promises'
import { join } from 'path'
import { pool } from '@/lib/direct-database'

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const fileId = params.id

    const client = await pool.connect()
    try {
      const result = await client.query(`
        SELECT nombre, url, tipo
        FROM "InversorArchivo"
        WHERE id = $1
      `, [fileId])

      if (result.rows.length === 0) {
        return NextResponse.json(
          { error: 'Archivo no encontrado' },
          { status: 404 }
        )
      }

      const file = result.rows[0]
      const filePath = join(process.cwd(), 'public', file.url)

      try {
        const fileBuffer = await readFile(filePath)
        
        return new NextResponse(fileBuffer, {
          headers: {
            'Content-Type': file.tipo,
            'Content-Disposition': `attachment; filename="${file.nombre}"`,
            'Content-Length': fileBuffer.length.toString(),
          },
        })
      } catch (fileError) {
        console.error('Error al leer archivo:', fileError)
        return NextResponse.json(
          { error: 'Archivo no encontrado en el servidor' },
          { status: 404 }
        )
      }

    } finally {
      client.release()
    }

  } catch (error) {
    console.error('Error al descargar archivo:', error)
    return NextResponse.json(
      { error: 'Error interno del servidor' },
      { status: 500 }
    )
  }
}

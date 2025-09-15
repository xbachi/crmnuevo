import { NextRequest, NextResponse } from 'next/server'
import { unlink } from 'fs/promises'
import { join } from 'path'
import { pool } from '@/lib/direct-database'

export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const fileId = params.id

    const client = await pool.connect()
    try {
      // Obtener información del archivo antes de eliminarlo
      const result = await client.query(`
        SELECT url
        FROM "InversorArchivo"
        WHERE id = $1
      `, [fileId])

      if (result.rows.length === 0) {
        return NextResponse.json(
          { error: 'Archivo no encontrado' },
          { status: 404 }
        )
      }

      const fileUrl = result.rows[0].url

      // Eliminar de la base de datos
      await client.query(`
        DELETE FROM "InversorArchivo"
        WHERE id = $1
      `, [fileId])

      // Eliminar archivo físico
      try {
        const filePath = join(process.cwd(), 'public', fileUrl)
        await unlink(filePath)
      } catch (fileError) {
        console.warn('No se pudo eliminar el archivo físico:', fileError)
        // No fallar si no se puede eliminar el archivo físico
      }

      return NextResponse.json({
        success: true,
        message: 'Archivo eliminado correctamente'
      })

    } finally {
      client.release()
    }

  } catch (error) {
    console.error('Error al eliminar archivo:', error)
    return NextResponse.json(
      { error: 'Error interno del servidor' },
      { status: 500 }
    )
  }
}

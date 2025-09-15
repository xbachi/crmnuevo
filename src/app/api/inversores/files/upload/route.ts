import { NextRequest, NextResponse } from 'next/server'
import { writeFile, mkdir } from 'fs/promises'
import { join } from 'path'
import { pool } from '@/lib/direct-database'

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData()
    const file = formData.get('file') as File
    const inversorId = formData.get('inversorId') as string
    const descripcion = formData.get('descripcion') as string

    if (!file || !inversorId) {
      return NextResponse.json(
        { error: 'Archivo e ID de inversor son requeridos' },
        { status: 400 }
      )
    }

    // Validar que el inversor existe
    const client = await pool.connect()
    try {
      const inversorResult = await client.query(
        'SELECT id FROM "Inversor" WHERE id = $1',
        [inversorId]
      )

      if (inversorResult.rows.length === 0) {
        return NextResponse.json(
          { error: 'Inversor no encontrado' },
          { status: 404 }
        )
      }

      // Crear directorio si no existe
      const uploadDir = join(process.cwd(), 'public', 'uploads', 'inversores', inversorId)
      await mkdir(uploadDir, { recursive: true })

      // Generar nombre único para el archivo
      const timestamp = Date.now()
      const fileExtension = file.name.split('.').pop()
      const fileName = `${timestamp}_${file.name.replace(/[^a-zA-Z0-9.-]/g, '_')}`
      const filePath = join(uploadDir, fileName)

      // Guardar archivo
      const bytes = await file.arrayBuffer()
      await writeFile(filePath, Buffer.from(bytes))

      // Guardar información en la base de datos
      const fileUrl = `/uploads/inversores/${inversorId}/${fileName}`
      const fileSize = file.size
      const mimeType = file.type

      const result = await client.query(`
        INSERT INTO "InversorArchivo" (
          "inversorId", nombre, url, tipo, tamaño, descripcion, "fechaSubida"
        ) VALUES ($1, $2, $3, $4, $5, $6, NOW())
        RETURNING id
      `, [inversorId, file.name, fileUrl, mimeType, fileSize, descripcion || null])

      return NextResponse.json({
        success: true,
        fileId: result.rows[0].id,
        message: 'Archivo subido correctamente'
      })

    } finally {
      client.release()
    }

  } catch (error) {
    console.error('Error al subir archivo:', error)
    return NextResponse.json(
      { error: 'Error interno del servidor' },
      { status: 500 }
    )
  }
}

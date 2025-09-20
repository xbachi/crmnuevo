import { NextRequest, NextResponse } from 'next/server'
import { writeFile, mkdir } from 'fs/promises'
import { join } from 'path'
import { existsSync } from 'fs'
import { pool } from '@/lib/db'

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData()
    const file = formData.get('file') as File
    const vehiculoId = formData.get('vehiculoId') as string

    if (!file || !vehiculoId) {
      return NextResponse.json({ error: 'Archivo y ID de vehículo requeridos' }, { status: 400 })
    }

    // Crear directorio si no existe
    const uploadDir = join(process.cwd(), 'public', 'uploads', 'vehiculos', vehiculoId)
    if (!existsSync(uploadDir)) {
      await mkdir(uploadDir, { recursive: true })
    }

    // Generar nombre único para el archivo
    const timestamp = Date.now()
    const fileName = `${timestamp}-${file.name}`
    const filePath = join(uploadDir, fileName)

    // Convertir archivo a buffer y guardarlo
    const bytes = await file.arrayBuffer()
    const buffer = Buffer.from(bytes)
    await writeFile(filePath, buffer)

    // Guardar información en la base de datos
    const insertQuery = `
      INSERT INTO VehiculoDocumentos 
      (vehiculo_id, nombre_archivo, nombre_original, ruta_archivo, tamaño_bytes, tipo_mime, fecha_subida)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING id, fecha_subida
    `
    
    const insertValues = [
      parseInt(vehiculoId),
      fileName,
      file.name,
      `/uploads/vehiculos/${vehiculoId}/${fileName}`,
      file.size,
      file.type,
      new Date().toISOString()
    ]
    
    const result = await pool.query(insertQuery, insertValues)
    const documentId = result.rows[0].id
    const fechaSubida = result.rows[0].fecha_subida

    console.log(`📁 Documento guardado en BD: ID ${documentId} para vehículo ${vehiculoId}`)

    // Retornar información del archivo
    return NextResponse.json({
      success: true,
      file: {
        id: documentId.toString(),
        nombre: file.name,
        tamaño: file.size,
        fechaSubida: fechaSubida,
        tipo: file.type,
        ruta: `/uploads/vehiculos/${vehiculoId}/${fileName}`
      }
    })

  } catch (error) {
    console.error('Error al subir archivo:', error)
    return NextResponse.json({ error: 'Error al subir archivo' }, { status: 500 })
  }
}

import { NextRequest, NextResponse } from 'next/server'
import { writeFile, mkdir } from 'fs/promises'
import { join } from 'path'
import { existsSync } from 'fs'

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

    // Retornar información del archivo
    return NextResponse.json({
      success: true,
      file: {
        id: timestamp.toString(),
        nombre: file.name,
        tamaño: file.size,
        fechaSubida: new Date().toISOString(),
        tipo: file.type,
        ruta: `/uploads/vehiculos/${vehiculoId}/${fileName}`
      }
    })

  } catch (error) {
    console.error('Error al subir archivo:', error)
    return NextResponse.json({ error: 'Error al subir archivo' }, { status: 500 })
  }
}

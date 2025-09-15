import { NextRequest, NextResponse } from 'next/server'
import { writeFile, mkdir } from 'fs/promises'
import { join } from 'path'
import { v4 as uuidv4 } from 'uuid'

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData()
    const file = formData.get('file') as File

    if (!file) {
      return NextResponse.json({ error: 'No se proporcionó ningún archivo' }, { status: 400 })
    }

    // Validar tipo de archivo
    if (file.type !== 'application/pdf') {
      return NextResponse.json({ error: 'Solo se permiten archivos PDF' }, { status: 400 })
    }

    // Validar tamaño (máximo 10MB)
    if (file.size > 10 * 1024 * 1024) {
      return NextResponse.json({ error: 'El archivo no puede ser mayor a 10MB' }, { status: 400 })
    }

    // Crear directorio si no existe
    const uploadDir = join(process.cwd(), 'public', 'uploads', 'documentacion')
    await mkdir(uploadDir, { recursive: true })

    // Generar nombre único para el archivo
    const fileId = uuidv4()
    const fileExtension = file.name.split('.').pop()
    const fileName = `${fileId}.${fileExtension}`
    const filePath = join(uploadDir, fileName)

    // Convertir archivo a buffer y guardarlo
    const bytes = await file.arrayBuffer()
    const buffer = Buffer.from(bytes)
    await writeFile(filePath, buffer)

    // Crear URL pública
    const fileUrl = `/uploads/documentacion/${fileName}`

    // Usar el tipo específico enviado desde el frontend
    const fileType = formData.get('type') as string || 'otro'

    const fileData = {
      id: fileId,
      name: file.name,
      type: fileType,
      url: fileUrl,
      uploadedAt: new Date().toISOString(),
      size: file.size
    }

    // Guardar metadatos
    try {
      const metadataResponse = await fetch(`${request.nextUrl.origin}/api/documentacion/metadata`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(fileData)
      })
      
      if (!metadataResponse.ok) {
        console.error('Error saving metadata:', await metadataResponse.text())
      }
    } catch (error) {
      console.error('Error saving metadata:', error)
    }

    return NextResponse.json(fileData, { status: 201 })
  } catch (error) {
    console.error('Error uploading file:', error)
    return NextResponse.json({ error: 'Error interno del servidor al subir archivo' }, { status: 500 })
  }
}

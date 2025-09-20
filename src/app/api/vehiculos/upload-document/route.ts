import { NextRequest, NextResponse } from 'next/server'
import { writeFile, mkdir } from 'fs/promises'
import { join } from 'path'
import { existsSync } from 'fs'
import { pool } from '@/lib/direct-database'

export async function POST(request: NextRequest) {
  try {
    console.log(`🔍 [UPLOAD API] Iniciando subida de archivo`)
    
    const formData = await request.formData()
    const file = formData.get('file') as File
    const vehiculoId = formData.get('vehiculoId') as string

    console.log(`📝 [UPLOAD API] Datos recibidos:`, {
      fileName: file?.name,
      fileSize: file?.size,
      fileType: file?.type,
      vehiculoId: vehiculoId
    })

    if (!file || !vehiculoId) {
      console.log(`❌ [UPLOAD API] Datos faltantes:`, { file: !!file, vehiculoId: !!vehiculoId })
      return NextResponse.json({ error: 'Archivo y ID de vehículo requeridos' }, { status: 400 })
    }

    // Crear directorio si no existe
    const uploadDir = join(process.cwd(), 'public', 'uploads', 'vehiculos', vehiculoId)
    console.log(`📁 [UPLOAD API] Directorio de subida: ${uploadDir}`)
    
    if (!existsSync(uploadDir)) {
      console.log(`📁 [UPLOAD API] Creando directorio: ${uploadDir}`)
      await mkdir(uploadDir, { recursive: true })
    }

    // Generar nombre único para el archivo
    const timestamp = Date.now()
    const fileName = `${timestamp}-${file.name}`
    const filePath = join(uploadDir, fileName)
    console.log(`📁 [UPLOAD API] Archivo destino: ${filePath}`)

    // Convertir archivo a buffer y guardarlo
    console.log(`💾 [UPLOAD API] Guardando archivo físico...`)
    const bytes = await file.arrayBuffer()
    const buffer = Buffer.from(bytes)
    await writeFile(filePath, buffer)
    console.log(`✅ [UPLOAD API] Archivo guardado exitosamente`)

    // Guardar información en la base de datos
    console.log(`💾 [UPLOAD API] Guardando información en base de datos...`)
    
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
    
    console.log(`🔍 [UPLOAD API] Query: ${insertQuery}`)
    console.log(`🔍 [UPLOAD API] Valores:`, insertValues)
    
    const result = await pool.query(insertQuery, insertValues)
    const documentId = result.rows[0].id
    const fechaSubida = result.rows[0].fecha_subida

    console.log(`✅ [UPLOAD API] Documento guardado en BD: ID ${documentId} para vehículo ${vehiculoId}`)

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
    console.error('❌ [UPLOAD API] Error al subir archivo:', error)
    console.error('❌ [UPLOAD API] Error details:', {
      message: error instanceof Error ? error.message : 'Error desconocido',
      stack: error instanceof Error ? error.stack : undefined,
      vehiculoId: formData?.get('vehiculoId')
    })
    return NextResponse.json({ 
      error: 'Error al subir archivo',
      details: error instanceof Error ? error.message : 'Error desconocido'
    }, { status: 500 })
  }
}

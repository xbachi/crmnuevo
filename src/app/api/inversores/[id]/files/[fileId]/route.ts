import { NextRequest, NextResponse } from 'next/server'
import { readFile, writeFile, unlink, mkdir } from 'fs/promises'
import { join } from 'path'
import { existsSync } from 'fs'

const METADATA_FILE = 'inversores-documentos-metadata.json'

async function loadMetadata(inversorId: string) {
  const metadataDir = join(
    process.cwd(),
    'public',
    'uploads',
    'inversores',
    inversorId
  )
  const metadataPath = join(metadataDir, METADATA_FILE)
  try {
    if (!existsSync(metadataPath)) {
      return []
    }
    const data = await readFile(metadataPath, 'utf-8')
    return JSON.parse(data)
  } catch (error) {
    console.error(`Error loading metadata for inversor ${inversorId}:`, error)
    return []
  }
}

async function saveMetadata(inversorId: string, metadata: any[]) {
  const metadataDir = join(
    process.cwd(),
    'public',
    'uploads',
    'inversores',
    inversorId
  )
  const metadataPath = join(metadataDir, METADATA_FILE)

  try {
    // Crear directorio si no existe
    await mkdir(metadataDir, { recursive: true })

    // Guardar metadatos
    await writeFile(metadataPath, JSON.stringify(metadata, null, 2), 'utf-8')
    console.log(
      `✅ [INVERSOR DELETE] Metadatos guardados para inversor ${inversorId}`
    )
  } catch (error) {
    console.error(
      `❌ [INVERSOR DELETE] Error guardando metadatos para inversor ${inversorId}:`,
      error
    )
    throw error
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; fileId: string }> }
) {
  try {
    const { id: inversorId, fileId } = await params

    console.log(
      `🗑️ [INVERSOR DELETE FILE] Eliminando archivo ${fileId} del inversor ${inversorId}`
    )

    // Cargar metadatos actuales
    const metadata = await loadMetadata(inversorId)
    console.log(
      `📁 [INVERSOR DELETE] Metadatos actuales: ${metadata.length} archivos`
    )

    // Encontrar el archivo a eliminar
    const fileIndex = metadata.findIndex((file: any) => file.id === fileId)

    if (fileIndex === -1) {
      console.log(
        `❌ [INVERSOR DELETE] Archivo ${fileId} no encontrado en metadatos`
      )
      return NextResponse.json(
        { error: 'Archivo no encontrado' },
        { status: 404 }
      )
    }

    const fileToDelete = metadata[fileIndex]
    console.log(`🔍 [INVERSOR DELETE] Archivo encontrado:`, fileToDelete)

    // Eliminar archivo físico
    const filePath = join(process.cwd(), 'public', fileToDelete.path)
    try {
      if (existsSync(filePath)) {
        await unlink(filePath)
        console.log(
          `✅ [INVERSOR DELETE] Archivo físico eliminado: ${filePath}`
        )
      } else {
        console.log(
          `⚠️ [INVERSOR DELETE] Archivo físico no encontrado: ${filePath}`
        )
      }
    } catch (error) {
      console.error(
        `❌ [INVERSOR DELETE] Error eliminando archivo físico:`,
        error
      )
      // Continuar aunque falle la eliminación física
    }

    // Eliminar de metadatos
    metadata.splice(fileIndex, 1)
    console.log(
      `📝 [INVERSOR DELETE] Archivo eliminado de metadatos. Quedan: ${metadata.length} archivos`
    )

    // Guardar metadatos actualizados
    await saveMetadata(inversorId, metadata)

    console.log(`✅ [INVERSOR DELETE] Archivo ${fileId} eliminado exitosamente`)

    return NextResponse.json({
      success: true,
      message: 'Archivo eliminado correctamente',
      remainingFiles: metadata.length,
    })
  } catch (error) {
    console.error(`❌ [INVERSOR DELETE] Error eliminando archivo:`, error)
    return NextResponse.json(
      {
        error: 'Error interno del servidor al eliminar archivo',
      },
      { status: 500 }
    )
  }
}

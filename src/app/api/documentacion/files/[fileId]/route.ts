import { NextRequest, NextResponse } from 'next/server'
import { unlink, readFile, writeFile, mkdir } from 'fs/promises'
import { join } from 'path'

const METADATA_FILE = 'documentacion-metadata.json'

async function loadMetadata() {
  try {
    const metadataDir = join(process.cwd(), 'public', 'uploads', 'documentacion')
    await mkdir(metadataDir, { recursive: true })
    const metadataPath = join(metadataDir, METADATA_FILE)
    const data = await readFile(metadataPath, 'utf-8')
    return JSON.parse(data)
  } catch (error) {
    return []
  }
}

async function saveMetadata(metadata: any[]) {
  const metadataDir = join(process.cwd(), 'public', 'uploads', 'documentacion')
  await mkdir(metadataDir, { recursive: true })
  const metadataPath = join(metadataDir, METADATA_FILE)
  await writeFile(metadataPath, JSON.stringify(metadata, null, 2))
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ fileId: string }> }
) {
  try {
    const { fileId } = await params

    if (!fileId) {
      return NextResponse.json({ error: 'ID de archivo requerido' }, { status: 400 })
    }

    // Cargar metadatos para encontrar el archivo
    const metadata = await loadMetadata()
    const fileMetadata = metadata.find((file: any) => file.id === fileId)
    
    if (!fileMetadata) {
      return NextResponse.json({ error: 'Archivo no encontrado en metadatos' }, { status: 404 })
    }

    // Eliminar archivo físico
    const docsDir = join(process.cwd(), 'public', 'uploads', 'documentacion')
    const filePath = join(docsDir, `${fileId}.pdf`)
    
    try {
      await unlink(filePath)
    } catch (unlinkError) {
      console.error('Error deleting physical file:', unlinkError)
      // Continuar aunque falle la eliminación del archivo físico
    }

    // Eliminar de metadatos
    const filteredMetadata = metadata.filter((file: any) => file.id !== fileId)
    await saveMetadata(filteredMetadata)
    
    return NextResponse.json({ message: 'Archivo eliminado correctamente' }, { status: 200 })
  } catch (error) {
    console.error('Error deleting file:', error)
    return NextResponse.json({ error: 'Error interno del servidor al eliminar archivo' }, { status: 500 })
  }
}

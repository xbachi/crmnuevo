import { NextRequest, NextResponse } from 'next/server'
import { readFile, mkdir } from 'fs/promises'
import { join } from 'path'

const METADATA_FILE = 'vehiculo-files-metadata.json'

async function loadMetadata(vehiculoId: string) {
  try {
    const metadataDir = join(process.cwd(), 'public', 'uploads', 'vehiculos', vehiculoId)
    await mkdir(metadataDir, { recursive: true })
    const metadataPath = join(metadataDir, METADATA_FILE)
    const data = await readFile(metadataPath, 'utf-8')
    return JSON.parse(data)
  } catch (error) {
    return []
  }
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: vehiculoId } = await params
    console.log(`📁 [FILES API] Obteniendo archivos para vehículo ${vehiculoId}`)
    
    const metadata = await loadMetadata(vehiculoId)
    console.log(`📁 [FILES API] Archivos encontrados:`, metadata.length)
    
    return NextResponse.json(metadata, { status: 200 })
  } catch (error) {
    console.error('❌ [FILES API] Error:', error)
    return NextResponse.json({ error: 'Error interno del servidor al cargar archivos' }, { status: 500 })
  }
}

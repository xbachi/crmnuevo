import { NextRequest, NextResponse } from 'next/server'
import { readFile, mkdir } from 'fs/promises'
import { join } from 'path'

const METADATA_FILE = 'inversores-documentos-metadata.json'

async function loadMetadata(inversorId: string) {
  try {
    const metadataDir = join(
      process.cwd(),
      'public',
      'uploads',
      'inversores',
      inversorId
    )
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
    const { id: inversorId } = await params
    console.log(
      `📁 [INVERSOR FILES API] Obteniendo archivos para inversor ${inversorId}`
    )

    const metadata = await loadMetadata(inversorId)
    console.log(
      `📁 [INVERSOR FILES API] Archivos encontrados:`,
      metadata.length
    )

    return NextResponse.json(metadata, { status: 200 })
  } catch (error) {
    console.error('❌ [INVERSOR FILES API] Error:', error)
    return NextResponse.json(
      { error: 'Error interno del servidor al cargar archivos' },
      { status: 500 }
    )
  }
}

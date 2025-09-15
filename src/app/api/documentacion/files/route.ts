import { NextResponse } from 'next/server'
import { readFile, mkdir } from 'fs/promises'
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

export async function GET() {
  try {
    const metadata = await loadMetadata()
    return NextResponse.json(metadata, { status: 200 })
  } catch (error) {
    console.error('Error loading documentation files:', error)
    return NextResponse.json({ error: 'Error interno del servidor al cargar archivos' }, { status: 500 })
  }
}
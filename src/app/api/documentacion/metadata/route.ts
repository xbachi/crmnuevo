import { NextRequest, NextResponse } from 'next/server'
import { readFile, writeFile, mkdir } from 'fs/promises'
import { join } from 'path'

const METADATA_FILE = 'documentacion-metadata.json'

interface DocumentMetadata {
  id: string
  name: string
  type: string
  url: string
  uploadedAt: string
  size: number
}

async function getMetadataPath(): Promise<string> {
  const metadataDir = join(process.cwd(), 'public', 'uploads', 'documentacion')
  await mkdir(metadataDir, { recursive: true })
  return join(metadataDir, METADATA_FILE)
}

async function loadMetadata(): Promise<DocumentMetadata[]> {
  try {
    const metadataPath = await getMetadataPath()
    const data = await readFile(metadataPath, 'utf-8')
    return JSON.parse(data)
  } catch (error) {
    return []
  }
}

async function saveMetadata(metadata: DocumentMetadata[]): Promise<void> {
  const metadataPath = await getMetadataPath()
  await writeFile(metadataPath, JSON.stringify(metadata, null, 2))
}

export async function GET() {
  try {
    const metadata = await loadMetadata()
    return NextResponse.json(metadata, { status: 200 })
  } catch (error) {
    console.error('Error loading metadata:', error)
    return NextResponse.json({ error: 'Error interno del servidor' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const newDoc: DocumentMetadata = await request.json()
    
    const metadata = await loadMetadata()
    metadata.push(newDoc)
    await saveMetadata(metadata)
    
    return NextResponse.json(newDoc, { status: 201 })
  } catch (error) {
    console.error('Error saving metadata:', error)
    return NextResponse.json({ error: 'Error interno del servidor' }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const fileId = searchParams.get('id')
    
    if (!fileId) {
      return NextResponse.json({ error: 'ID de archivo requerido' }, { status: 400 })
    }
    
    const metadata = await loadMetadata()
    const filteredMetadata = metadata.filter(doc => doc.id !== fileId)
    await saveMetadata(filteredMetadata)
    
    return NextResponse.json({ success: true }, { status: 200 })
  } catch (error) {
    console.error('Error deleting metadata:', error)
    return NextResponse.json({ error: 'Error interno del servidor' }, { status: 500 })
  }
}

import { NextRequest, NextResponse } from 'next/server'
import { unlink } from 'fs/promises'
import { join } from 'path'

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ fileId: string }> }
) {
  try {
    const { fileId } = await params

    if (!fileId) {
      return NextResponse.json(
        { error: 'ID de archivo requerido' },
        { status: 400 }
      )
    }

    // Buscar el archivo en todos los directorios de deals
    const dealsDir = join(process.cwd(), 'public', 'uploads', 'deals')

    // Por simplicidad, asumimos que el archivo está en algún subdirectorio
    // En una implementación real, podrías mantener una base de datos de archivos
    const filePath = join(dealsDir, '**', `${fileId}.pdf`)

    try {
      await unlink(filePath)
      return NextResponse.json(
        { message: 'Archivo eliminado correctamente' },
        { status: 200 }
      )
    } catch (unlinkError) {
      console.error('Error deleting file:', unlinkError)
      return NextResponse.json(
        { error: 'Archivo no encontrado' },
        { status: 404 }
      )
    }
  } catch (error) {
    console.error('Error deleting file:', error)
    return NextResponse.json(
      { error: 'Error interno del servidor al eliminar archivo' },
      { status: 500 }
    )
  }
}

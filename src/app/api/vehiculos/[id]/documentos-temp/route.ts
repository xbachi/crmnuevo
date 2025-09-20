import { NextRequest, NextResponse } from 'next/server'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: vehiculoId } = await params
    console.log(`🔍 [DOCUMENTOS TEMP API] Obteniendo documentos para vehículo ${vehiculoId}`)

    // Retornar lista vacía temporalmente hasta que la tabla esté creada
    return NextResponse.json({
      success: true,
      documentos: []
    })

  } catch (error) {
    console.error('❌ [DOCUMENTOS TEMP API] Error:', error)
    return NextResponse.json({ 
      success: false, 
      error: 'Error al obtener documentos del vehículo',
      documentos: []
    }, { status: 500 })
  }
}

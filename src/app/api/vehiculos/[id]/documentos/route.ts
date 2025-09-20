import { NextRequest, NextResponse } from 'next/server'
import { pool } from '@/lib/direct-database'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: vehiculoId } = await params
    console.log(`🔍 [DOCUMENTOS API] Iniciando obtención de documentos`)
    console.log(`📝 [DOCUMENTOS API] Vehículo ID: ${vehiculoId}`)
    console.log(`📝 [DOCUMENTOS API] URL completa: ${request.url}`)

    // Verificar conexión a la base de datos
    console.log(`🔗 [DOCUMENTOS API] Verificando conexión a BD...`)
    const testQuery = 'SELECT 1 as test'
    await pool.query(testQuery)
    console.log(`✅ [DOCUMENTOS API] Conexión a BD exitosa`)

    const query = `
      SELECT 
        id,
        nombre_original as nombre,
        tamaño_bytes as tamaño,
        fecha_subida as fechaSubida,
        tipo_mime as tipo,
        ruta_archivo as ruta
      FROM VehiculoDocumentos 
      WHERE vehiculo_id = $1 
      ORDER BY fecha_subida DESC
    `

    console.log(`🔍 [DOCUMENTOS API] Ejecutando query: ${query}`)
    console.log(`🔍 [DOCUMENTOS API] Con parámetros: [${vehiculoId}]`)

    const result = await pool.query(query, [vehiculoId])
    
    console.log(`📁 [DOCUMENTOS API] Query ejecutada exitosamente`)
    console.log(`📁 [DOCUMENTOS API] Encontrados ${result.rows.length} documentos`)
    console.log(`📁 [DOCUMENTOS API] Documentos:`, result.rows)

    return NextResponse.json({
      success: true,
      documentos: result.rows
    })

  } catch (error) {
    console.error('❌ [DOCUMENTOS API] Error al obtener documentos del vehículo:', error)
    console.error('❌ [DOCUMENTOS API] Error details:', {
      message: error instanceof Error ? error.message : 'Error desconocido',
      stack: error instanceof Error ? error.stack : undefined,
      vehiculoId: vehiculoId
    })
    return NextResponse.json({ 
      success: false, 
      error: 'Error al obtener documentos del vehículo',
      documentos: [],
      details: error instanceof Error ? error.message : 'Error desconocido'
    }, { status: 500 })
  }
}

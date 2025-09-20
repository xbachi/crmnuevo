import { NextRequest, NextResponse } from 'next/server'
import { pool } from '@/lib/db'

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const vehiculoId = params.id
    console.log(`📁 Obteniendo documentos para vehículo ${vehiculoId}`)

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

    const result = await pool.query(query, [vehiculoId])
    
    console.log(`📁 Encontrados ${result.rows.length} documentos para vehículo ${vehiculoId}`)

    return NextResponse.json({
      success: true,
      documentos: result.rows
    })

  } catch (error) {
    console.error('Error al obtener documentos del vehículo:', error)
    return NextResponse.json({ 
      success: false, 
      error: 'Error al obtener documentos del vehículo',
      documentos: []
    }, { status: 500 })
  }
}

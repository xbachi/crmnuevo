import { NextRequest, NextResponse } from 'next/server'
import { Pool } from 'pg'

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
})

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ referencia: string }> }
) {
  try {
    const { referencia } = await params
    
    console.log(`🔍 [ENDPOINT] Buscando vehículo por referencia: "${referencia}"`)
    
    // Limpiar la referencia para búsqueda (quitar prefijos)
    const cleanReferencia = referencia.replace(/^[#IDR-]+/, '').replace(/[^0-9]/g, '')
    console.log(`🧹 [ENDPOINT] Referencia limpia: "${cleanReferencia}"`)
    
    // Usar una consulta simple con solo las columnas básicas para evitar errores
    const query = `
      SELECT * FROM "Vehiculo" 
      WHERE referencia = $1 
         OR referencia = $2 
         OR referencia = $3 
         OR referencia = $4
         OR referencia = $5
      LIMIT 1
    `
    
    // Buscar con diferentes formatos posibles
    const searchTerms = [
      cleanReferencia,           // Solo número
      `#${cleanReferencia}`,     // Con #
      `I-${cleanReferencia}`,    // Con I-
      `D-${cleanReferencia}`,    // Con D-
      `R-${cleanReferencia}`     // Con R-
    ]
    
    console.log(`🔎 [ENDPOINT] Términos de búsqueda:`, searchTerms)
    console.log(`📝 [ENDPOINT] Query SQL:`, query)
    
    const result = await pool.query(query, searchTerms)
    
    console.log(`📊 [ENDPOINT] Resultados encontrados: ${result.rows.length}`)
    
    if (result.rows.length === 0) {
      console.log(`❌ [ENDPOINT] Vehículo no encontrado para referencia: ${referencia}`)
      return NextResponse.json(
        { error: 'Vehículo no encontrado' },
        { status: 404 }
      )
    }
    
    console.log(`✅ [ENDPOINT] Vehículo encontrado:`, {
      id: result.rows[0].id,
      referencia: result.rows[0].referencia,
      marca: result.rows[0].marca,
      modelo: result.rows[0].modelo
    })
    
    return NextResponse.json(result.rows[0])
  } catch (error) {
    console.error('❌ [ENDPOINT] Error al buscar vehículo por referencia:', error)
    console.error('❌ [ENDPOINT] Detalles del error:', {
      message: error.message,
      code: error.code,
      detail: error.detail
    })
    return NextResponse.json(
      { error: 'Error interno del servidor' },
      { status: 500 }
    )
  }
}

import { NextRequest, NextResponse } from 'next/server'
import { Pool } from 'pg'

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
})

export async function GET(
  request: NextRequest,
  { params }: { params: { referencia: string } }
) {
  try {
    const { referencia } = params
    
    // Limpiar la referencia para búsqueda (quitar prefijos)
    const cleanReferencia = referencia.replace(/^[#IDR-]+/, '').replace(/[^0-9]/g, '')
    
    const query = `
      SELECT 
        id, referencia, marca, modelo, matricula, bastidor, kms, tipo, estado, orden,
        color, "fechaMatriculacion", año, combustible, cambio, potencia, cilindrada, 
        puertas, plazas, categoria,
        "precioCompra", "gastosTransporte", "gastosTasas", "gastosMecanica", 
        "gastosPintura", "gastosLimpieza", "gastosOtros", "precioPublicacion", 
        "precioVenta", "beneficioNeto",
        "esCocheInversor", "inversorId", "inversorNombre", "fechaCompra", 
        "notasInversor", "fotoInversor",
        itv, "fechaItv", "fechaVencimientoItv", seguro, "segundaLlave", 
        carpeta, master, "hojasA", documentacion, ubicacion,
        "createdAt", "updatedAt"
      FROM vehiculos 
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
    
    const result = await pool.query(query, searchTerms)
    
    if (result.rows.length === 0) {
      return NextResponse.json(
        { error: 'Vehículo no encontrado' },
        { status: 404 }
      )
    }
    
    return NextResponse.json(result.rows[0])
  } catch (error) {
    console.error('Error al buscar vehículo por referencia:', error)
    return NextResponse.json(
      { error: 'Error interno del servidor' },
      { status: 500 }
    )
  }
}

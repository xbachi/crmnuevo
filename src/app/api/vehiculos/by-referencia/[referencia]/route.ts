import { NextRequest, NextResponse } from 'next/server'
import { pool } from '@/lib/direct-database'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ referencia: string }> }
) {
  try {
    const { referencia } = await params

    // console.log(`🔍 [ENDPOINT] Buscando vehículo por referencia: "${referencia}"`)

    // Limpiar la referencia para búsqueda (quitar prefijos)
    const cleanReferencia = referencia
      .replace(/^[#IDR-]+/, '')
      .replace(/[^0-9]/g, '')
    // console.log(`🧹 [ENDPOINT] Referencia limpia: "${cleanReferencia}"`)

    // Usar exactamente las mismas columnas que funcionan en getVehiculos
    const query = `
      SELECT 
        v.id, v.referencia, v.marca, v.modelo, v.matricula, v.bastidor, 
        v.kms, v.tipo, v.estado, v.orden, v."createdAt", v."updatedAt",
        v.color, v."fechaMatriculacion", v.año, v."esCocheInversor", 
        v."inversorId", v."fechaCompra", v."precioCompra", v."gastosTransporte",
        v."gastosTasas", v."gastosMecanica", v."gastosPintura", v."gastosLimpieza",
        v."gastosOtros", v."precioPublicacion", v."precioVenta", v."beneficioNeto",
        v."notasInversor", v."fotoInversor", v.itv, v.seguro, v."segundaLlave",
        v.carpeta, v.master, v."hojasA", v.documentacion, i.nombre as inversor_nombre
      FROM "Vehiculo" v
      LEFT JOIN "Inversor" i ON v."inversorId" = i.id
      WHERE v.referencia = $1 
         OR v.referencia = $2 
         OR v.referencia = $3 
         OR v.referencia = $4
         OR v.referencia = $5
      LIMIT 1
    `

    // Buscar con diferentes formatos posibles
    const searchTerms = [
      cleanReferencia, // Solo número
      `#${cleanReferencia}`, // Con #
      `I-${cleanReferencia}`, // Con I-
      `D-${cleanReferencia}`, // Con D-
      `R-${cleanReferencia}`, // Con R-
    ]

    console.log(`🔎 [ENDPOINT] Términos de búsqueda:`, searchTerms)
    console.log(`📝 [ENDPOINT] Query SQL:`, query)

    const result = await pool.query(query, searchTerms)

    // console.log(`📊 [ENDPOINT] Resultados encontrados: ${result.rows.length}`)

    if (result.rows.length === 0) {
      // console.log(`❌ [ENDPOINT] Vehículo no encontrado para referencia: ${referencia}`)
      return NextResponse.json(
        { error: 'Vehículo no encontrado' },
        { status: 404 }
      )
    }

    // console.log(`✅ [ENDPOINT] Vehículo encontrado:`, {
    //   id: result.rows[0].id,
    //   referencia: result.rows[0].referencia,
    //   marca: result.rows[0].marca,
    //   modelo: result.rows[0].modelo
    // })

    return NextResponse.json(result.rows[0])
  } catch (error) {
    console.error(
      '❌ [ENDPOINT] Error al buscar vehículo por referencia:',
      error
    )
    const err = error as { code?: unknown; detail?: unknown }
    console.error('❌ [ENDPOINT] Detalles del error:', {
      message: error instanceof Error ? error.message : String(error),
      code: err.code,
      detail: err.detail,
    })
    return NextResponse.json(
      { error: 'Error interno del servidor' },
      { status: 500 }
    )
  }
}

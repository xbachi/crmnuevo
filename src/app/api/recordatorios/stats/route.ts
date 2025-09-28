import { NextResponse } from 'next/server'
import { pool } from '@/lib/direct-database'

export async function GET() {
  const client = await pool.connect()
  try {
    // ITVs pendientes
    const itvResult = await client.query(`
      SELECT COUNT(*) as count
      FROM "Vehiculo"
      WHERE itv IS NOT NULL 
      AND (itv = 'No' OR itv = 'NO' OR itv ILIKE '%vencida%' OR itv ILIKE '%vencido%')
      AND UPPER(TRIM(estado)) NOT IN ('VENDIDO', 'RESERVADO')
    `)

    // Documentación pendiente
    const docsResult = await client.query(`
      SELECT COUNT(*) as count
      FROM "Vehiculo"
      WHERE (documentacion IS NULL OR documentacion = 'No' OR documentacion = 'NO' OR documentacion = '')
      AND UPPER(TRIM(estado)) NOT IN ('VENDIDO', 'RESERVADO')
    `)

    // Cambio de nombre pendiente
    const cambioNombreResult = await client.query(`
      SELECT COUNT(*) as count
      FROM "Deal" d
      JOIN "Vehiculo" v ON d."vehiculoId" = v.id
      WHERE d.estado = 'facturado' 
      AND (d."cambioNombreSolicitado" IS NULL OR d."cambioNombreSolicitado" = false)
    `)

    // Facturar pendiente (deals vendidos pero no facturados)
    const facturarResult = await client.query(`
      SELECT COUNT(*) as count
      FROM "Deal" d
      JOIN "Vehiculo" v ON d."vehiculoId" = v.id
      WHERE d.estado = 'vendido' 
      AND d.estado != 'facturado'
    `)

    const stats = {
      itvs_pendientes: parseInt(itvResult.rows[0].count),
      documentacion_pendiente: parseInt(docsResult.rows[0].count),
      cambio_nombre_pendiente: parseInt(cambioNombreResult.rows[0].count),
      facturar_pendiente: parseInt(facturarResult.rows[0].count),
    }

    return NextResponse.json(stats)
  } catch (error) {
    console.error('Error fetching reminder stats:', error)
    return NextResponse.json(
      { error: 'Error al obtener estadísticas de recordatorios' },
      { status: 500 }
    )
  } finally {
    client.release()
  }
}

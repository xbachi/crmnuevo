import { NextRequest, NextResponse } from 'next/server'
import { pool } from '@/lib/database'

export async function GET(request: NextRequest) {
  const client = await pool.connect()

  try {
    const year = new Date().getFullYear()

    // Buscar el último número de factura del año actual
    // Buscar en deals que tengan factura
    const dealsQuery = `
      SELECT numero 
      FROM "Deal" 
      WHERE factura IS NOT NULL 
      AND numero LIKE 'F-${year}-%'
      ORDER BY numero DESC 
      LIMIT 1
    `

    const dealsResult = await client.query(dealsQuery)

    // Buscar facturas independientes en el directorio de documentos
    // (esto es una aproximación, ya que no tenemos una tabla específica para facturas independientes)
    const documentsQuery = `
      SELECT numero 
      FROM "Deal" 
      WHERE numero LIKE 'FAC-${year}-%'
      ORDER BY numero DESC 
      LIMIT 1
    `

    const documentsResult = await client.query(documentsQuery)

    // Encontrar el número más alto entre ambos
    let lastNumber = 0

    if (dealsResult.rows.length > 0) {
      const dealNumber = dealsResult.rows[0].numero
      const match = dealNumber.match(/F-(\d{4})-(\d{4})/)
      if (match) {
        lastNumber = Math.max(lastNumber, parseInt(match[2]))
      }
    }

    if (documentsResult.rows.length > 0) {
      const docNumber = documentsResult.rows[0].numero
      const match = docNumber.match(/FAC-(\d{4})-(\d{4})/)
      if (match) {
        lastNumber = Math.max(lastNumber, parseInt(match[2]))
      }
    }

    // Generar el siguiente número
    const nextNumber = lastNumber + 1
    const formattedNumber = `F-${year}-${String(nextNumber).padStart(4, '0')}`

    return NextResponse.json({
      nextNumber: formattedNumber,
      year,
      sequence: nextNumber,
    })
  } catch (error) {
    console.error('Error obteniendo siguiente número de factura:', error)
    return NextResponse.json(
      { error: 'Error interno del servidor' },
      { status: 500 }
    )
  } finally {
    client.release()
  }
}

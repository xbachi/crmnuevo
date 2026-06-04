import { NextRequest, NextResponse } from 'next/server'
import { pool } from '@/lib/direct-database'
import { promises as fs } from 'fs'
import path from 'path'

export async function GET(request: NextRequest) {
  const client = await pool.connect()

  try {
    const year = new Date().getFullYear()

    // Buscar TODOS los números de factura del año actual en toda la aplicación
    // 1. Buscar en deals que tengan factura (campo factura no null)
    const dealsQuery = `
      SELECT factura 
      FROM "Deal" 
      WHERE factura IS NOT NULL 
      AND factura LIKE '%F-${year}-%'
      ORDER BY factura DESC 
      LIMIT 10
    `

    // 2. Buscar en el directorio de documentos físicos (facturas independientes)
    // Esto requiere acceso al sistema de archivos
    const documentsDir = path.join(process.cwd(), 'public', 'documents')

    let lastNumber = 0

    // Procesar facturas de deals
    const dealsResult = await client.query(dealsQuery)
    for (const row of dealsResult.rows) {
      const factura = row.factura
      // Extraer número de factura del formato: factura-iva-F-2025-0001.pdf
      const match = factura.match(/F-(\d{4})-(\d{4})/)
      if (match) {
        lastNumber = Math.max(lastNumber, parseInt(match[2]))
      }
    }

    // Procesar facturas independientes del directorio
    try {
      const files = await fs.readdir(documentsDir)
      for (const file of files) {
        // Buscar archivos que coincidan con el patrón F-YYYY-####.pdf
        const match = file.match(/F-(\d{4})-(\d{4})\.pdf$/)
        if (match) {
          lastNumber = Math.max(lastNumber, parseInt(match[2]))
        }
      }
    } catch (dirError) {
      console.log(
        'Directorio de documentos no existe o no se puede leer:',
        dirError instanceof Error ? dirError.message : String(dirError)
      )
    }

    // Generar el siguiente número
    const nextNumber = lastNumber + 1
    const formattedNumber = `F-${year}-${String(nextNumber).padStart(4, '0')}`

    console.log('🔍 [API NEXT-NUMBER] Resultado:', {
      year,
      lastNumber,
      nextNumber,
      formattedNumber,
      dealsFound: dealsResult.rows.length,
    })

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

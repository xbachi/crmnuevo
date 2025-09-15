import { NextRequest, NextResponse } from 'next/server'
import { pool } from '@/lib/direct-database'

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ dealId: string }> }
) {
  try {
    const { dealId: dealIdString } = await params
    const dealId = parseInt(dealIdString)
    
    if (isNaN(dealId)) {
      return NextResponse.json({ error: 'ID de deal inválido' }, { status: 400 })
    }

    // Eliminar recordatorios de cambio de nombre para este deal
    const client = await pool.connect()
    try {
      const result = await client.query(
        `DELETE FROM "ClienteReminder" 
         WHERE deal_id = $1 
         AND titulo ILIKE '%cambio de nombre%'`,
        [dealId]
      )
      
      console.log(`🗑️ Recordatorios de cambio de nombre eliminados para deal ${dealId}`)
      
      return NextResponse.json({ 
        success: true, 
        message: 'Recordatorios de cambio de nombre eliminados' 
      })
    } finally {
      client.release()
    }

  } catch (error) {
    console.error('Error eliminando recordatorios de cambio de nombre:', error)
    return NextResponse.json(
      { error: 'Error interno del servidor' },
      { status: 500 }
    )
  }
}

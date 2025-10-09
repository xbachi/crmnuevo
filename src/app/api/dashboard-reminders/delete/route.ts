import { NextRequest, NextResponse } from 'next/server'
import { Pool } from 'pg'

// Crear pool de conexiones PostgreSQL
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false,
  },
})

export async function DELETE(request: NextRequest) {
  try {
    const { vehiculoId, tipo, dealId } = await request.json()

    console.log(
      `🗑️ [DASHBOARD REMINDERS DELETE] Eliminando recordatorio automático:`,
      {
        vehiculoId,
        tipo,
        dealId,
      }
    )

    const client = await pool.connect()

    let result
    let message

    if (tipo === 'itv_vencida' && vehiculoId) {
      // Marcar ITV como "ignorada" o actualizar fecha para que no aparezca más
      result = await client.query(
        `UPDATE "Vehiculo" 
         SET itv_vencimiento = itv_vencimiento + INTERVAL '1 year'
         WHERE id = $1`,
        [parseInt(vehiculoId)]
      )
      message = 'ITV marcada como procesada'
    } else if (tipo === 'documentacion_pendiente' && vehiculoId) {
      // Marcar como que tiene documentación (agregar un campo o actualizar estado)
      result = await client.query(
        `UPDATE "Vehiculo" 
         SET estado = 'PUBLICADO'
         WHERE id = $1`,
        [parseInt(vehiculoId)]
      )
      message = 'Documentación marcada como procesada'
    } else if (tipo === 'cambio_nombre_pendiente' && dealId) {
      // Marcar el deal como que ya se procesó el cambio de nombre
      result = await client.query(
        `UPDATE "Deal" 
         SET cambio_nombre_procesado = true
         WHERE id = $1`,
        [parseInt(dealId)]
      )
      message = 'Cambio de nombre marcado como procesado'
    } else {
      client.release()
      return NextResponse.json(
        { error: 'Tipo de recordatorio no válido o faltan parámetros' },
        { status: 400 }
      )
    }

    client.release()

    if (result.rowCount === 0) {
      return NextResponse.json(
        { error: 'Registro no encontrado' },
        { status: 404 }
      )
    }

    console.log(`✅ [DASHBOARD REMINDERS DELETE] ${message}`)
    return NextResponse.json({ message })
  } catch (error) {
    console.error('❌ [DASHBOARD REMINDERS DELETE] Error:', error)
    return NextResponse.json(
      { error: 'Error interno del servidor' },
      { status: 500 }
    )
  }
}

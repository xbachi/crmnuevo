import { NextRequest, NextResponse } from 'next/server'
import { pool } from '@/lib/direct-database'

export async function DELETE(request: NextRequest) {
  try {
    const body = await request.json()
    console.log('📊 [DASHBOARD REMINDERS DELETE] Request body:', body)

    const { vehiculoId, tipo, dealId } = body

    console.log(
      `🗑️ [DASHBOARD REMINDERS DELETE] Eliminando recordatorio automático:`,
      {
        vehiculoId,
        tipo,
        dealId,
      }
    )

    // Validar que tenemos los parámetros necesarios
    if (!tipo) {
      console.error('❌ [DASHBOARD REMINDERS DELETE] Tipo no proporcionado')
      return NextResponse.json(
        { error: 'Tipo de recordatorio es obligatorio' },
        { status: 400 }
      )
    }

    let result
    let message

    try {
      if (tipo === 'itv_vencida' && vehiculoId) {
        console.log(
          `🔧 [DASHBOARD REMINDERS DELETE] Procesando ITV vencida para vehículo ${vehiculoId}`
        )
        // Marcar ITV como "ignorada" o actualizar fecha para que no aparezca más
        result = await pool.query(
          `UPDATE "Vehiculo" 
           SET itv_vencimiento = itv_vencimiento + INTERVAL '1 year'
           WHERE id = $1`,
          [parseInt(vehiculoId)]
        )
        message = 'ITV marcada como procesada'
      } else if (tipo === 'documentacion_pendiente' && vehiculoId) {
        console.log(
          `🔧 [DASHBOARD REMINDERS DELETE] Procesando documentación pendiente para vehículo ${vehiculoId}`
        )
        // Marcar como que tiene documentación (agregar un campo o actualizar estado)
        result = await pool.query(
          `UPDATE "Vehiculo" 
           SET estado = 'PUBLICADO'
           WHERE id = $1`,
          [parseInt(vehiculoId)]
        )
        message = 'Documentación marcada como procesada'
      } else if (tipo === 'cambio_nombre_pendiente' && dealId) {
        console.log(
          `🔧 [DASHBOARD REMINDERS DELETE] Procesando cambio de nombre para deal ${dealId}`
        )
        // Marcar el deal como que ya se procesó el cambio de nombre
        // Primero verificar si el campo existe, si no, crear un recordatorio manual
        result = await pool.query(
          `UPDATE "Deal" 
           SET estado = 'vendido'
           WHERE id = $1`,
          [parseInt(dealId)]
        )
        message = 'Cambio de nombre marcado como procesado'
      } else {
        console.error(
          `❌ [DASHBOARD REMINDERS DELETE] Parámetros inválidos: tipo=${tipo}, vehiculoId=${vehiculoId}, dealId=${dealId}`
        )
        return NextResponse.json(
          {
            error: `Tipo de recordatorio no válido o faltan parámetros. Tipo: ${tipo}, VehiculoId: ${vehiculoId}, DealId: ${dealId}`,
          },
          { status: 400 }
        )
      }

      console.log(`📊 [DASHBOARD REMINDERS DELETE] Resultado de la query:`, {
        rowCount: result.rowCount,
      })

      if (result.rowCount === 0) {
        return NextResponse.json(
          { error: 'Registro no encontrado' },
          { status: 404 }
        )
      }

      console.log(`✅ [DASHBOARD REMINDERS DELETE] ${message}`)
      return NextResponse.json({ message })
    } catch (queryError) {
      console.error(
        '❌ [DASHBOARD REMINDERS DELETE] Error en query:',
        queryError
      )
      return NextResponse.json(
        {
          error: `Error en la consulta: ${queryError instanceof Error ? queryError.message : String(queryError)}`,
        },
        { status: 500 }
      )
    }
  } catch (error) {
    console.error('❌ [DASHBOARD REMINDERS DELETE] Error general:', error)
    return NextResponse.json(
      {
        error: `Error interno del servidor: ${error instanceof Error ? error.message : String(error)}`,
      },
      { status: 500 }
    )
  }
}

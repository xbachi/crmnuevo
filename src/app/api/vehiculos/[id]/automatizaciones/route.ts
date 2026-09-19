/**
 * GET/POST /api/vehiculos/[id]/automatizaciones — pedidos a la PC del dueño
 * (publicar.py / luna.py) para este coche. GET → historial + estado de la PC;
 * POST {tipo, modo, simulacion_id?} encola. Simular: cualquier sesión;
 * aplicar: admin, y los tipos con simulación exigen una simulación ok de este
 * coche y tipo de hace < 30 min. Lógica en src/lib/automatizaciones.ts.
 */
import { NextRequest, NextResponse } from 'next/server'
import { requireAdminSession, requireApiSession } from '@/lib/apiAuth'
import {
  SIMULACION_VIGENTE_MIN,
  TIPO_LABEL,
  admiteAutomatizaciones,
  encolar,
  estadoWorker,
  leerSimulacion,
  leerVehiculoParaTrabajo,
  listarPorVehiculo,
  motivoSimulacionInvalida,
  requiereSimulacion,
  validarPedido,
} from '@/lib/automatizaciones'

export const dynamic = 'force-dynamic'

type Params = { params: Promise<{ id: string }> }

function parseId(id: string): number | null {
  const n = parseInt(id, 10)
  return Number.isFinite(n) && n > 0 ? n : null
}

function conflicto(error: string) {
  return NextResponse.json({ error }, { status: 409 })
}

export async function GET(_request: NextRequest, { params }: Params) {
  const { id } = await params
  const vehiculoId = parseId(id)
  if (vehiculoId == null) {
    return NextResponse.json(
      { error: 'ID de vehículo inválido' },
      { status: 400 }
    )
  }
  try {
    // En serie: el pool es de 3 conexiones compartidas.
    const trabajos = await listarPorVehiculo(vehiculoId)
    const worker = await estadoWorker()
    return NextResponse.json({ trabajos, worker })
  } catch (error) {
    console.error('[automatizaciones GET]', error)
    return NextResponse.json(
      { error: 'Error interno del servidor' },
      { status: 500 }
    )
  }
}

export async function POST(request: NextRequest, { params }: Params) {
  const { id } = await params
  const vehiculoId = parseId(id)
  if (vehiculoId == null) {
    return NextResponse.json(
      { error: 'ID de vehículo inválido' },
      { status: 400 }
    )
  }
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'JSON inválido' }, { status: 400 })
  }
  const val = validarPedido(body)
  if (!val.ok) return NextResponse.json({ error: val.error }, { status: 400 })
  const { tipo, modo, simulacion_id } = val.pedido

  const auth =
    modo === 'aplicar'
      ? requireAdminSession(request)
      : requireApiSession(request)
  if (auth.response) return auth.response

  try {
    const vehiculo = await leerVehiculoParaTrabajo(vehiculoId)
    if (!vehiculo) {
      return NextResponse.json(
        { error: 'Vehículo no encontrado' },
        { status: 404 }
      )
    }
    if (!admiteAutomatizaciones(vehiculo.tipo)) {
      return conflicto(
        'Este coche no está en la hoja Base_Datos (sólo compras, inversor y depósito): no hay web ni carteles que actualizar.'
      )
    }
    if (!vehiculo.referencia && !vehiculo.matricula) {
      return conflicto('El coche no tiene referencia ni matrícula.')
    }

    const label = TIPO_LABEL[tipo]
    if (modo === 'aplicar' && requiereSimulacion(tipo)) {
      if (simulacion_id == null) {
        return conflicto(
          `Para aplicar «${label}» primero hay que simular y aplicar desde esa simulación (vale ${SIMULACION_VIGENTE_MIN} minutos).`
        )
      }
      const motivo = motivoSimulacionInvalida(
        await leerSimulacion(simulacion_id),
        { vehiculoId, tipo }
      )
      if (motivo) {
        return conflicto(
          `No se puede aplicar «${label}»: la simulación #${simulacion_id} ${motivo}. Hay que volver a simular.`
        )
      }
    }

    const r = await encolar({
      vehiculoId,
      referencia: vehiculo.referencia,
      matricula: vehiculo.matricula,
      tipo,
      modo,
      simulacionId: simulacion_id,
      creadoPor: auth.session.uid ?? null,
    })
    if (!r.ok) {
      return conflicto(
        `Ya hay un pedido de «${label}» pendiente o en curso para este coche.`
      )
    }
    return NextResponse.json({ trabajo: r.trabajo })
  } catch (error) {
    console.error('[automatizaciones POST]', error)
    return NextResponse.json(
      { error: 'Error interno del servidor' },
      { status: 500 }
    )
  }
}

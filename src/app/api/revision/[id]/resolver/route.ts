/**
 * POST /api/revision/[id]/resolver — aprobación de 1 clic de la bandeja.
 *
 * Requiere sesión (validada acá: el prefijo /api/revision está en la whitelist
 * del middleware para el POST de n8n; mismo patrón que /api/automation-log).
 *
 * Body: { accion: 'aprobar' | 'descartar', datos?: { ...campos corregidos } }
 *
 * Al aprobar, según payload.tipoAccion:
 *  · 'gasto'    → ejecuta la carga del gasto REUTILIZANDO el handler de
 *    /api/vehiculos/gasto: se importa su POST y se invoca en-proceso con un
 *    NextRequest construido con el X-Webhook-Secret de env (sin red, sin
 *    duplicar validaciones/dedup/resync). Se manda force=1 porque un humano
 *    ya verificó el importe (el item existe justamente porque la guarda de
 *    rango lo rechazó con 422).
 *  · 'registro' → UPDATE de facturas_registro (fecha/importe) de la fila
 *    payload.registroId, recomputando anio/trimestre/mes si cambia la fecha.
 *  · otro       → solo marca resuelto con la resolución guardada.
 *
 * Siempre guarda resolucion + resuelto_por (uid de la sesión) + resuelto_at.
 */

import { NextRequest, NextResponse } from 'next/server'
import { pool } from '@/lib/direct-database'
import { requireApiSession } from '@/lib/apiAuth'
import { parseImporte } from '@/lib/gastoImporte'
import { periodoFromDate } from '@/lib/facturasRegistro'

type Datos = Record<string, unknown>

async function ejecutarGasto(payload: Datos, datos: Datos) {
  // Body para /api/vehiculos/gasto: el original de n8n si viene en el payload,
  // si no los campos extraídos; encima las correcciones del usuario.
  const base =
    payload.gasto && typeof payload.gasto === 'object'
      ? (payload.gasto as Datos)
      : {
          matricula: payload.matricula,
          tipo: payload.tipo ?? payload.categoria,
          importe: payload.importe,
          numeroFactura: payload.numeroFactura,
          proveedor: payload.proveedor,
        }
  const body = { ...base, ...datos, force: '1' }

  const { POST: gastoPost } = await import('@/app/api/vehiculos/gasto/route')
  const req = new NextRequest('http://internal/api/vehiculos/gasto', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-webhook-secret': process.env.N8N_INVOICE_WEBHOOK_SECRET ?? '',
    },
    body: JSON.stringify(body),
  })
  const res = await gastoPost(req)
  const json = await res.json().catch(() => null)
  return { status: res.status, respuesta: json }
}

async function actualizarRegistro(payload: Datos, datos: Datos) {
  const registroId = parseInt(String(payload.registroId ?? ''), 10)
  if (isNaN(registroId)) {
    return { error: 'payload.registroId inválido o ausente' }
  }
  const fecha = datos.fecha != null && String(datos.fecha).trim() !== ''
    ? String(datos.fecha).trim()
    : payload.fecha != null && String(payload.fecha).trim() !== ''
      ? String(payload.fecha).trim()
      : null
  const importe = datos.importe != null
    ? parseImporte(datos.importe)
    : payload.importe != null
      ? parseImporte(payload.importe)
      : null
  if (fecha == null && importe == null) {
    return { error: 'nada para actualizar: falta fecha y/o importe' }
  }

  const sets: string[] = []
  const params: unknown[] = []
  if (fecha != null) {
    const { anio, trimestre, mes } = periodoFromDate(fecha)
    params.push(fecha, anio, trimestre, mes)
    sets.push(`fecha_factura = $${params.length - 3}`)
    sets.push(`anio = $${params.length - 2}`)
    sets.push(`trimestre = $${params.length - 1}`)
    sets.push(`mes = $${params.length}`)
  }
  if (importe != null) {
    params.push(importe)
    sets.push(`importe = $${params.length}`)
  }
  params.push(registroId)
  const upd = await pool.query(
    `UPDATE facturas_registro SET ${sets.join(', ')}, updated_at = NOW()
      WHERE id = $${params.length} RETURNING id`,
    params
  )
  if (upd.rows.length === 0) {
    return { error: `facturas_registro id=${registroId} no existe` }
  }
  return { registroId, fecha, importe }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = requireApiSession(request)
  if (auth.response) return auth.response

  const { id: idStr } = await params
  const id = parseInt(idStr, 10)
  if (isNaN(id)) {
    return NextResponse.json({ error: 'id inválido' }, { status: 400 })
  }

  const b = (await request.json().catch(() => ({}))) as Record<string, unknown>
  const accion = String(b.accion ?? '').trim()
  if (accion !== 'aprobar' && accion !== 'descartar') {
    return NextResponse.json(
      { error: `accion inválida: "${accion}". Válidas: aprobar, descartar` },
      { status: 400 }
    )
  }
  const datos =
    b.datos && typeof b.datos === 'object' && !Array.isArray(b.datos)
      ? (b.datos as Datos)
      : {}

  try {
    const cur = await pool.query(
      `SELECT id, origen, estado, payload FROM revision_items WHERE id = $1 LIMIT 1`,
      [id]
    )
    const item = cur.rows[0]
    if (!item) {
      return NextResponse.json({ error: 'item no encontrado' }, { status: 404 })
    }
    if (item.estado !== 'pendiente') {
      return NextResponse.json(
        { error: `item ya resuelto (estado: ${item.estado})` },
        { status: 409 }
      )
    }

    const payload = (item.payload ?? {}) as Datos
    let resultado: Datos = {}

    if (accion === 'aprobar') {
      const tipoAccion = String(payload.tipoAccion ?? '')
      if (tipoAccion === 'gasto') {
        const r = await ejecutarGasto(payload, datos)
        if (r.status >= 400) {
          return NextResponse.json(
            { error: 'la carga del gasto falló', gasto: r },
            { status: 422 }
          )
        }
        resultado = { tipoAccion, gasto: r }
      } else if (tipoAccion === 'registro') {
        const r = await actualizarRegistro(payload, datos)
        if ('error' in r) {
          return NextResponse.json({ error: r.error }, { status: 422 })
        }
        resultado = { tipoAccion, registro: r }
      }
      // otros orígenes: solo se marca resuelto con la resolución guardada
    }

    const resolucion = { accion, datos, resultado }
    const estado = accion === 'aprobar' ? 'aprobado' : 'descartado'
    await pool.query(
      `UPDATE revision_items
          SET estado = $1, resolucion = $2, resuelto_por = $3,
              resuelto_at = NOW(), updated_at = NOW()
        WHERE id = $4`,
      [estado, JSON.stringify(resolucion), `uid:${auth.session.uid}`, id]
    )

    return NextResponse.json({ ok: true, id, estado, resolucion })
  } catch (err) {
    return NextResponse.json(
      { error: (err as Error).message ?? String(err) },
      { status: 500 }
    )
  }
}

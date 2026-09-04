/**
 * PATCH /api/expedientes/[id]
 *
 * Edición manual de un expediente (requiere sesión):
 *   { clave, presente, nota? }  → marca/desmarca un item de la checklist
 *   { estado }                  → transición manual de estado
 * Ambas pueden combinarse en la misma llamada.
 *
 * Regla dura: NUNCA se puede quedar en completo/enviado/confirmado con
 * requeridos faltantes → 422. Al desmarcar un item requerido el estado se
 * degrada solo a 'incompleto' (evaluarEstado).
 */

import { NextRequest, NextResponse } from 'next/server'
import { pool } from '@/lib/direct-database'
import { requireApiSession } from '@/lib/apiAuth'
import {
  ESTADOS_EXPEDIENTE,
  evaluarEstado,
  faltanRequeridos,
  type ChecklistItem,
  type EstadoExpediente,
} from '@/lib/expedienteChecklist'

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = requireApiSession(request)
  if (auth.response) return auth.response

  const { id: idStr } = await params
  const id = parseInt(idStr, 10)
  if (!Number.isFinite(id)) {
    return NextResponse.json({ error: 'id inválido' }, { status: 400 })
  }

  const body = (await request.json().catch(() => null)) as {
    clave?: unknown
    presente?: unknown
    nota?: unknown
    estado?: unknown
  } | null
  if (!body || typeof body !== 'object') {
    return NextResponse.json({ error: 'body JSON requerido' }, { status: 400 })
  }

  const clave = typeof body.clave === 'string' ? body.clave : null
  const estado = typeof body.estado === 'string' ? body.estado : null
  if (!clave && !estado) {
    return NextResponse.json(
      { error: 'nada que actualizar: manda {clave, presente} y/o {estado}' },
      { status: 400 }
    )
  }
  if (clave && typeof body.presente !== 'boolean') {
    return NextResponse.json(
      { error: 'presente (boolean) es obligatorio al marcar un item' },
      { status: 400 }
    )
  }
  if (estado && !(ESTADOS_EXPEDIENTE as readonly string[]).includes(estado)) {
    return NextResponse.json(
      { error: `estado inválido. Válidos: ${ESTADOS_EXPEDIENTE.join(', ')}` },
      { status: 400 }
    )
  }

  try {
    const expRes = await pool.query<{
      id: number
      estado: EstadoExpediente
      checklist: ChecklistItem[]
    }>(`SELECT id, estado, checklist FROM expedientes WHERE id = $1`, [id])
    const exp = expRes.rows[0]
    if (!exp) {
      return NextResponse.json({ error: 'Expediente no encontrado' }, { status: 404 })
    }

    const checklist: ChecklistItem[] = (exp.checklist ?? []).map((i) => ({ ...i }))
    if (clave) {
      const item = checklist.find((i) => i.clave === clave)
      if (!item) {
        return NextResponse.json(
          { error: `clave desconocida en la checklist: ${clave}` },
          { status: 400 }
        )
      }
      item.presente = body.presente as boolean
      if (body.nota !== undefined) {
        item.nota = body.nota == null ? null : String(body.nota)
      }
    }

    let nuevoEstado: EstadoExpediente
    if (estado) {
      const faltantes = faltanRequeridos(checklist)
      if (estado !== 'incompleto' && faltantes.length > 0) {
        // Un expediente incompleto NUNCA se considera finalizado.
        return NextResponse.json(
          {
            error: `No se puede pasar a '${estado}' con documentos requeridos faltantes`,
            faltantes,
          },
          { status: 422 }
        )
      }
      nuevoEstado = estado as EstadoExpediente
    } else {
      nuevoEstado = evaluarEstado(checklist, exp.estado)
    }

    const updated = await pool.query(
      `UPDATE expedientes
          SET checklist = $1::jsonb, estado = $2, updated_at = NOW()
        WHERE id = $3
        RETURNING id, tipo_operacion, deal_id, b2b_venta_id, vehiculo_id, matricula,
                  numero_factura, invoice_date::text, estado, checklist, notas,
                  created_at, updated_at`,
      [JSON.stringify(checklist), nuevoEstado, id]
    )
    return NextResponse.json({ ok: true, expediente: updated.rows[0] })
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 })
  }
}

/**
 * POST /api/fiscal/registro/[id]/estado — transiciones manuales del documento.
 *
 * Para las salidas laterales del ciclo de vida: 'anulada' (el proveedor la anuló,
 * o nunca debió registrarse) y 'rectificada' (la sustituyó una rectificativa).
 * Marcar en vez de borrar: una factura que desaparece deja un hueco que nadie
 * puede explicar seis meses después, y el archivo sigue existiendo igual.
 *
 * NO se puede saltar a 'declarada' ni 'en-borrador' a mano (400). Esos dos
 * estados los pone el cierre trimestral (Fase 2) sobre el conjunto del trimestre:
 * si se pudieran poner de a una, tendríamos facturas "declaradas" que no están en
 * ningún modelo presentado — exactamente la mentira que este módulo evita.
 * Para volver atrás desde una anulación se usa este mismo endpoint con los
 * estados del flujo normal.
 *
 * Body: { estado, motivo }. El motivo es OBLIGATORIO: anular es la operación que
 * más hay que justificar ante una inspección.
 *
 * Auth: admin.
 */

import { NextRequest, NextResponse } from 'next/server'
import { pool } from '@/lib/direct-database'
import { requireAdminSession } from '@/lib/apiAuth'
import { registrarCambio } from '@/lib/fiscalAudit'
import { serializarRegistro } from '@/lib/fiscalApi'

export const maxDuration = 30

// Espejo del CHECK chk_fr_estado.
const ESTADOS_CHECK = [
  'registrada',
  'extraida',
  'pendiente-validar',
  'validada',
  'en-borrador',
  'declarada',
  'rectificada',
  'anulada',
] as const

// Los pone el cierre trimestral, no una persona (ver cabecera).
const SOLO_CIERRE = ['declarada', 'en-borrador'] as const

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = requireAdminSession(request)
  if (auth.response) return auth.response
  const actor = `uid:${auth.session.uid}`

  const { id: idStr } = await params
  const id = parseInt(idStr, 10)
  if (!Number.isInteger(id) || id <= 0) {
    return NextResponse.json({ error: `id inválido: "${idStr}"` }, { status: 400 })
  }

  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>
  const estado = String(body.estado ?? '').trim().toLowerCase()
  const motivo = String(body.motivo ?? '').trim()

  if (!(ESTADOS_CHECK as readonly string[]).includes(estado)) {
    return NextResponse.json(
      { error: `estado inválido: "${estado}" (válidos: ${ESTADOS_CHECK.join(', ')})` },
      { status: 400 }
    )
  }
  if ((SOLO_CIERRE as readonly string[]).includes(estado)) {
    return NextResponse.json(
      {
        error: `"${estado}" no se pone a mano: lo asigna el cierre trimestral sobre todo el trimestre. Una factura marcada como declarada que no esté en ningún modelo presentado es peor que no marcarla.`,
        code: 'ESTADO_RESERVADO',
      },
      { status: 400 }
    )
  }
  if (!motivo) {
    return NextResponse.json(
      { error: 'motivo es obligatorio: una transición manual sin motivo no se puede justificar después' },
      { status: 400 }
    )
  }

  const client = await pool.connect()
  try {
    await client.query('BEGIN')

    const sel = await client.query(
      `SELECT id, estado FROM facturas_registro WHERE id = $1 FOR UPDATE`,
      [id]
    )
    if (sel.rows.length === 0) {
      await client.query('ROLLBACK')
      return NextResponse.json({ error: `No existe la factura ${id}` }, { status: 404 })
    }
    const antes = sel.rows[0]

    if (String(antes.estado) === estado) {
      await client.query('ROLLBACK')
      return NextResponse.json({ error: `La factura ya está en estado "${estado}"` }, { status: 409 })
    }

    const upd = await client.query(
      `UPDATE facturas_registro SET estado = $2, updated_at = NOW() WHERE id = $1 RETURNING *`,
      [id, estado]
    )

    await registrarCambio(client, {
      tabla: 'facturas_registro',
      filaId: id,
      accion: 'transicion',
      cambios: { estado: { antes: antes.estado, despues: estado } },
      actor,
      motivo,
    })

    await client.query('COMMIT')
    return NextResponse.json({
      ok: true,
      ...serializarRegistro(upd.rows[0]),
      mensaje: `La factura pasó de "${antes.estado}" a "${estado}".`,
    })
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {})
    console.error('[fiscal/registro/[id]/estado] POST:', (err as Error)?.message ?? err)
    return NextResponse.json({ error: 'No se pudo cambiar el estado' }, { status: 500 })
  } finally {
    client.release()
  }
}

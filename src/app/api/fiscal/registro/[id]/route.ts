/**
 * GET   /api/fiscal/registro/[id] — ficha de una factura de proveedor.
 * PATCH /api/fiscal/registro/[id] — corrección de sus datos fiscales.
 *
 * El GET devuelve `extraccionRaw` (lo que el extractor creyó leer) junto a los
 * valores actuales: la ficha existe para que el humano compare el PDF con lo que
 * la máquina entendió. Y el `historial` (fiscal_audit_log) para que, cuando el
 * dato esté mal, se vea si lo puso n8n o lo cambió alguien a mano.
 *
 * El PATCH delega TODO en aplicarCorrecciones (src/lib/fiscalRegistroEdit) — la
 * misma función que usa /validar, para que corregir y corregir+validar no puedan
 * divergir. Acá solo se traducen sus errores a HTTP y se elige la acción de
 * auditoría.
 *
 * Un cuadre que no da NO es un 400. El usuario está corrigiendo a mano con el PDF
 * delante, quizá en varios pasos; cortarlo a mitad le hace perder el trabajo. Se
 * guarda con datos_incompletos=true y los errores viajan en la respuesta (200).
 * Quien rechaza el math KO es /validar, que es donde importa.
 *
 * Auth: GET sesión, PATCH admin.
 */

import { NextRequest, NextResponse } from 'next/server'
import { pool } from '@/lib/direct-database'
import { requireApiSession, requireAdminSession } from '@/lib/apiAuth'
import { registrarCambio, RegistroInmutableError } from '@/lib/fiscalAudit'
import { PeriodoCerradoError } from '@/lib/periodoLock'
import {
  aplicarCorrecciones,
  RegistroNoEncontradoError,
  ValidacionError,
} from '@/lib/fiscalRegistroEdit'
import { serializarRegistro, serializarLinea, serializarProveedor } from '@/lib/fiscalApi'

export const maxDuration = 30

function parseId(idStr: string): number | null {
  const id = parseInt(idStr, 10)
  return Number.isInteger(id) && id > 0 ? id : null
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = requireApiSession(request)
  if (auth.response) return auth.response

  const { id: idStr } = await params
  const id = parseId(idStr)
  if (id == null) return NextResponse.json({ error: `id inválido: "${idStr}"` }, { status: 400 })

  try {
    // Secuenciales: el pool está capado a 1 conexión por instancia.
    const reg = await pool.query(`SELECT * FROM facturas_registro WHERE id = $1`, [id])
    if (reg.rows.length === 0) {
      return NextResponse.json({ error: `No existe la factura ${id}` }, { status: 404 })
    }
    const row = reg.rows[0]

    const lineas = await pool.query(
      `SELECT * FROM facturas_registro_lineas WHERE registro_id = $1 ORDER BY orden`,
      [id]
    )

    const hist = await pool.query(
      `SELECT id, accion, cambios, motivo, actor, created_at
         FROM fiscal_audit_log
        WHERE tabla = 'facturas_registro' AND fila_id = $1
        ORDER BY created_at DESC, id DESC
        LIMIT 20`,
      [id]
    )

    let proveedor: Record<string, unknown> | null = null
    if (row.proveedor_id != null) {
      const p = await pool.query(`SELECT * FROM proveedores WHERE id = $1`, [row.proveedor_id])
      if (p.rows.length > 0) proveedor = serializarProveedor(p.rows[0])
    }

    return NextResponse.json({
      ...serializarRegistro({ ...row, lineas: lineas.rows.length }),
      lineas: lineas.rows.map(serializarLinea),
      extraccionRaw: row.extraccion_raw ?? null,
      validadaPor: row.validada_por ?? null,
      validadaAt: row.validada_at ?? null,
      estadoPago: row.estado_pago ?? null,
      proveedor,
      historial: hist.rows.map((h) => ({
        id: Number(h.id),
        accion: h.accion,
        cambios: h.cambios ?? {},
        motivo: h.motivo ?? null,
        actor: h.actor,
        createdAt: h.created_at,
      })),
    })
  } catch (err) {
    console.error('[fiscal/registro/[id]] GET:', (err as Error)?.message ?? err)
    return NextResponse.json({ error: 'No se pudo leer la factura' }, { status: 500 })
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = requireAdminSession(request)
  if (auth.response) return auth.response
  const actor = `uid:${auth.session.uid}`

  const { id: idStr } = await params
  const id = parseId(idStr)
  if (id == null) return NextResponse.json({ error: `id inválido: "${idStr}"` }, { status: 400 })

  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>
  const force = body.force === true || body.force === 'true'
  const motivo = String(body.motivo ?? '').trim() || null

  const client = await pool.connect()
  try {
    await client.query('BEGIN')

    const r = await aplicarCorrecciones(client, id, body)

    if (Object.keys(r.cambios).length > 0) {
      await registrarCambio(client, {
        tabla: 'facturas_registro',
        filaId: id,
        // Tocar una factura ya declarada no es una edición más: se marca distinto
        // para que la auditoría pueda listar exactamente esos casos ante una
        // inspección (son los que hacen que el CRM y el modelo presentado difieran).
        accion: force ? 'correccion-post-declaracion' : 'editar',
        cambios: r.cambios,
        actor,
        motivo: motivo ?? undefined,
      })
    }

    await client.query('COMMIT')

    return NextResponse.json({
      ...serializarRegistro({ ...r.despues, lineas: r.lineas.length }),
      lineas: r.lineas,
      cuadre: {
        ok: r.math.ok,
        baseTotal: r.math.baseTotal,
        cuotaTotal: r.math.cuotaTotal,
        calculado: r.math.calculado,
        declarado: r.math.declarado,
        diferencia: r.math.diferencia,
        errores: [...r.erroresLineas, ...r.math.errores],
      },
      // Se guardó, pero no está listo para validar. La UI lo muestra como aviso.
      ...(r.reemplazoLineas && !r.math.ok
        ? {
            aviso:
              'Los cambios se guardaron, pero el desglose no cuadra con el importe: la factura queda marcada como incompleta y no se puede validar hasta arreglarlo.',
          }
        : {}),
    })
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {})

    if (err instanceof RegistroNoEncontradoError) {
      return NextResponse.json({ error: `No existe la factura ${id}` }, { status: 404 })
    }
    if (err instanceof ValidacionError) {
      return NextResponse.json({ error: err.message, errores: err.errores }, { status: 400 })
    }
    if (err instanceof RegistroInmutableError) {
      return NextResponse.json(
        { error: err.message, code: 'REGISTRO_INMUTABLE', estado: err.estado },
        { status: 409 }
      )
    }
    if (err instanceof PeriodoCerradoError) {
      return NextResponse.json(
        { error: err.message, code: 'PERIODO_CERRADO', anio: err.anio, mes: err.mes },
        { status: 409 }
      )
    }

    console.error('[fiscal/registro/[id]] PATCH:', (err as Error)?.message ?? err)
    return NextResponse.json({ error: 'No se pudo actualizar la factura' }, { status: 500 })
  } finally {
    client.release()
  }
}

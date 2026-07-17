/**
 * POST /api/fiscal/proveedores/[id]/merge — fusiona `origenId` dentro de `[id]`.
 *
 * POR QUÉ: el maestro se pobló por el texto libre de facturas_registro.proveedor,
 * que llega escrito distinto según la fuente (email, OneDrive, concepto bancario).
 * El mismo proveedor real termina como 2-3 fichas y sus facturas repartidas: el
 * libro de IVA lo cuenta como 3 emisores distintos y el 347 sale mal. Esto es lo
 * que las junta.
 *
 * EL ORIGEN NO SE BORRA, se desactiva (activo=false). Dos razones:
 *  · facturas_registro.proveedor_id lo referencia por FK — un DELETE reventaría o
 *    (peor) dejaría facturas huérfanas.
 *  · el histórico importa: qué se declaró bajo qué ficha es la respuesta ante una
 *    inspección. Un maestro que se puede borrar no prueba nada.
 * El nombre del origen y sus aliases se absorben como aliases del destino, así
 * que el matching futuro de ese texto cae solo en la ficha buena.
 *
 * Todo en UNA transacción: si el UPDATE masivo de facturas falla, el origen no
 * queda desactivado con sus facturas todavía apuntándole.
 *
 * Body: { origenId: number }.  Auth: admin.
 */

import { NextRequest, NextResponse } from 'next/server'
import { pool } from '@/lib/direct-database'
import { requireAdminSession } from '@/lib/apiAuth'
import { registrarCambio } from '@/lib/fiscalAudit'
import { serializarProveedor } from '@/lib/fiscalApi'

export const maxDuration = 30

const MOTIVO = 'fusión de proveedores'

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = requireAdminSession(request)
  if (auth.response) return auth.response
  const actor = `uid:${auth.session.uid}`

  const { id: idStr } = await params
  const destinoId = parseInt(idStr, 10)
  if (!Number.isInteger(destinoId) || destinoId <= 0) {
    return NextResponse.json({ error: `id inválido: "${idStr}"` }, { status: 400 })
  }

  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>
  const origenId = Number(body.origenId)
  if (!Number.isInteger(origenId) || origenId <= 0) {
    return NextResponse.json(
      { error: 'origenId es obligatorio: es el proveedor que se absorbe' },
      { status: 400 }
    )
  }
  if (origenId === destinoId) {
    return NextResponse.json(
      { error: 'No se puede fusionar un proveedor consigo mismo' },
      { status: 400 }
    )
  }

  const client = await pool.connect()
  try {
    await client.query('BEGIN')

    // Bloqueo en orden de id: dos merges cruzados simultáneos se deadlockearían
    // si cada uno tomara sus filas en el orden de sus argumentos.
    const [primero, segundo] = [destinoId, origenId].sort((a, b) => a - b)
    const sel = await client.query(
      `SELECT * FROM proveedores WHERE id IN ($1, $2) ORDER BY id FOR UPDATE`,
      [primero, segundo]
    )
    const destino = sel.rows.find((r) => Number(r.id) === destinoId)
    const origen = sel.rows.find((r) => Number(r.id) === origenId)
    if (!destino) {
      await client.query('ROLLBACK')
      return NextResponse.json({ error: `No existe el proveedor destino ${destinoId}` }, { status: 404 })
    }
    if (!origen) {
      await client.query('ROLLBACK')
      return NextResponse.json({ error: `No existe el proveedor origen ${origenId}` }, { status: 404 })
    }

    // 1. Mover las facturas.
    const mov = await client.query(
      `UPDATE facturas_registro SET proveedor_id = $1, proveedor = $2, updated_at = NOW()
        WHERE proveedor_id = $3`,
      [destinoId, destino.nombre, origenId]
    )
    const facturasMovidas = mov.rowCount ?? 0

    // 2. Absorber nombre + aliases del origen, sin duplicar (case-insensitive) y
    //    sin quedarse con el propio nombre del destino como alias de sí mismo.
    const aliasDestino: string[] = Array.isArray(destino.aliases) ? destino.aliases : []
    const aliasOrigen: string[] = Array.isArray(origen.aliases) ? origen.aliases : []
    const vistos = new Set(aliasDestino.map((a) => String(a).toLowerCase()))
    vistos.add(String(destino.nombre).toLowerCase())
    const aliasFinal = [...aliasDestino]
    for (const cand of [String(origen.nombre), ...aliasOrigen]) {
      const s = String(cand ?? '').trim()
      if (!s) continue
      const k = s.toLowerCase()
      if (vistos.has(k)) continue
      vistos.add(k)
      aliasFinal.push(s)
    }

    const updDestino = await client.query(
      `UPDATE proveedores SET aliases = $2, updated_at = NOW() WHERE id = $1 RETURNING *`,
      [destinoId, aliasFinal]
    )

    // 3. Desactivar el origen (nunca borrar: FKs + histórico).
    await client.query(
      `UPDATE proveedores SET activo = false, updated_at = NOW() WHERE id = $1`,
      [origenId]
    )

    // 4. Auditar AMBAS filas: desde cualquiera de las dos fichas se tiene que
    //    poder reconstruir la fusión.
    await registrarCambio(client, {
      tabla: 'proveedores',
      filaId: destinoId,
      accion: 'editar',
      cambios: {
        aliases: { antes: aliasDestino, despues: aliasFinal },
        facturas_absorbidas: { antes: 0, despues: facturasMovidas },
        origen_fusionado: { antes: null, despues: { id: origenId, nombre: origen.nombre } },
      },
      actor,
      motivo: MOTIVO,
    })
    await registrarCambio(client, {
      tabla: 'proveedores',
      filaId: origenId,
      accion: 'editar',
      cambios: {
        activo: { antes: Boolean(origen.activo), despues: false },
        facturas_movidas: { antes: facturasMovidas, despues: 0 },
        fusionado_en: { antes: null, despues: { id: destinoId, nombre: destino.nombre } },
      },
      actor,
      motivo: MOTIVO,
    })

    await client.query('COMMIT')
    return NextResponse.json({
      ok: true,
      facturasMovidas,
      destino: serializarProveedor(updDestino.rows[0]),
      origen: { id: origenId, nombre: origen.nombre, activo: false },
      mensaje: `Se movieron ${facturasMovidas} factura(s) de "${origen.nombre}" a "${destino.nombre}". "${origen.nombre}" quedó desactivado (no se borra: el histórico y las FKs lo necesitan) y su nombre pasó a ser un alias del destino.`,
    })
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {})
    console.error('[fiscal/proveedores/merge] POST:', (err as Error)?.message ?? err)
    return NextResponse.json({ error: 'No se pudo fusionar; no se cambió nada' }, { status: 500 })
  } finally {
    client.release()
  }
}

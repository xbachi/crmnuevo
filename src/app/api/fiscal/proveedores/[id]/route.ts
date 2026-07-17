/**
 * PATCH /api/fiscal/proveedores/[id] — edición de la ficha de un proveedor.
 *
 * Es donde se completan los NIF: el backfill creó 17 proveedores por nombre y
 * TODOS con nif NULL (los NIF no se inventan). Sin NIF no hay 347 ni libro de
 * IVA, así que esta pantalla es la que desbloquea el cierre.
 *
 * Cada edición queda en fiscal_audit_log con el diff campo a campo y el uid que
 * la hizo: los *_defecto de un proveedor se copian a cada factura nueva que
 * llega, así que tocar una ficha reclasifica en silencio todo lo que venga
 * después. Cuando en septiembre algo esté mal clasificado, el log dice quién
 * cambió el default y cuándo.
 *
 * Un NIF inválido NO bloquea el guardado (ver fiscalProveedorEdit): vuelve como
 * `aviso`. Colisión de nombre/NIF → 409 nombrando al proveedor que ya lo ocupa.
 *
 * Auth: admin.
 */

import { NextRequest, NextResponse } from 'next/server'
import { pool } from '@/lib/direct-database'
import { requireAdminSession } from '@/lib/apiAuth'
import { registrarCambio, diffCampos } from '@/lib/fiscalAudit'
import { serializarProveedor } from '@/lib/fiscalApi'
import {
  camposProveedor,
  colisionProveedor,
  ProveedorValidacionError,
} from '@/lib/fiscalProveedorEdit'

export const maxDuration = 30

export async function PATCH(
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

  // Fuera del try: el handler de 23505 los necesita para explicar la colisión, y
  // el body de la request ya está consumido (no se puede volver a leer).
  let campos: Record<string, unknown> = {}

  const client = await pool.connect()
  try {
    await client.query('BEGIN')

    const sel = await client.query(`SELECT * FROM proveedores WHERE id = $1 FOR UPDATE`, [id])
    if (sel.rows.length === 0) {
      await client.query('ROLLBACK')
      return NextResponse.json({ error: `No existe el proveedor ${id}` }, { status: 404 })
    }
    const antes = sel.rows[0]

    // El NIF se valida contra el país FINAL: si el body no lo cambia, vale el de
    // la ficha. Sin esto, editar solo el NIF de un proveedor alemán lo validaría
    // como español y lo marcaría inválido siempre.
    let aviso: string | null
    try {
      ;({ campos, aviso } = camposProveedor({ pais: antes.pais ?? 'ES', ...body }))
    } catch (err) {
      await client.query('ROLLBACK')
      if (err instanceof ProveedorValidacionError) {
        return NextResponse.json({ error: err.message, errores: err.errores }, { status: 400 })
      }
      throw err
    }

    // `pais` se inyecta siempre (arriba) para poder validar el NIF; si el body no
    // lo mandaba, no es un cambio → fuera del UPDATE.
    if (body.pais === undefined) delete campos.pais

    const cols = Object.keys(campos)
    if (cols.length === 0) {
      await client.query('ROLLBACK')
      return NextResponse.json({ proveedor: serializarProveedor(antes), sinCambios: true })
    }

    const upd = await client.query(
      `UPDATE proveedores SET ${cols.map((c, i) => `${c} = $${i + 2}`).join(', ')}, updated_at = NOW()
        WHERE id = $1
        RETURNING *`,
      [id, ...cols.map((c) => campos[c])]
    )
    const despues = upd.rows[0]

    const cambios = diffCampos(antes, campos)
    if (Object.keys(cambios).length > 0) {
      await registrarCambio(client, {
        tabla: 'proveedores',
        filaId: id,
        accion: 'editar',
        cambios,
        actor,
      })
    }

    await client.query('COMMIT')
    return NextResponse.json({
      proveedor: serializarProveedor(despues),
      ...(aviso ? { aviso } : {}),
    })
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {})
    if ((err as { code?: string })?.code === '23505') {
      return NextResponse.json(await colisionProveedor(pool, campos, id), { status: 409 })
    }
    console.error('[fiscal/proveedores/[id]] PATCH:', (err as Error)?.message ?? err)
    return NextResponse.json({ error: 'No se pudo actualizar el proveedor' }, { status: 500 })
  } finally {
    client.release()
  }
}

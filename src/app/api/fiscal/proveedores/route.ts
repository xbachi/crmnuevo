/**
 * GET  /api/fiscal/proveedores — maestro de proveedores + nº de facturas de cada uno.
 * POST /api/fiscal/proveedores — alta.
 *
 * POR QUÉ EL CONTEO EN LA LISTA: el maestro arrancó con 17 filas de un backfill
 * por nombre, y 37 facturas cayeron en el proveedor comodín 'otro'. La lista
 * ordenada por nº de facturas desc pone arriba justamente lo que hay que arreglar
 * primero (los que más facturas mueven y siguen sin NIF), y `sinNif` marca a los
 * que la AEAT rechazaría en el 347. Es una lista de trabajo, no un ABM.
 *
 * El conteo va en UNA query (LEFT JOIN + GROUP BY): con N+1 el pool de 1 conexión
 * por instancia de Vercel se convierte en 17 round-trips secuenciales.
 *
 * Auth: GET sesión (cualquiera consulta), POST admin (el maestro es fiscal).
 */

import { NextRequest, NextResponse } from 'next/server'
import { pool } from '@/lib/direct-database'
import { requireApiSession, requireAdminSession } from '@/lib/apiAuth'
import { registrarCambio } from '@/lib/fiscalAudit'
import { serializarProveedor } from '@/lib/fiscalApi'
import {
  camposProveedor,
  colisionProveedor,
  ProveedorValidacionError,
} from '@/lib/fiscalProveedorEdit'

export const maxDuration = 30

export async function GET(request: NextRequest) {
  const auth = requireApiSession(request)
  if (auth.response) return auth.response

  try {
    const res = await pool.query(
      `SELECT p.*, COUNT(f.id) AS facturas
         FROM proveedores p
         LEFT JOIN facturas_registro f ON f.proveedor_id = p.id
        GROUP BY p.id
        ORDER BY COUNT(f.id) DESC, lower(p.nombre) ASC`
    )
    return NextResponse.json({ proveedores: res.rows.map(serializarProveedor) })
  } catch (err) {
    console.error('[fiscal/proveedores] GET:', (err as Error)?.message ?? err)
    return NextResponse.json(
      { error: 'No se pudo leer el maestro de proveedores' },
      { status: 500 }
    )
  }
}

export async function POST(request: NextRequest) {
  const auth = requireAdminSession(request)
  if (auth.response) return auth.response
  const actor = `uid:${auth.session.uid}`

  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>

  let campos: Record<string, unknown>
  let aviso: string | null
  try {
    ;({ campos, aviso } = camposProveedor(body))
  } catch (err) {
    if (err instanceof ProveedorValidacionError) {
      return NextResponse.json({ error: err.message, errores: err.errores }, { status: 400 })
    }
    throw err
  }

  const nombre = campos.nombre
  if (!nombre) {
    return NextResponse.json(
      { error: 'nombre es obligatorio: es la identidad canónica del proveedor' },
      { status: 400 }
    )
  }

  const client = await pool.connect()
  try {
    await client.query('BEGIN')

    const cols = Object.keys(campos)
    const ins = await client.query(
      `INSERT INTO proveedores (${cols.join(', ')})
       VALUES (${cols.map((_, i) => `$${i + 1}`).join(', ')})
       RETURNING *`,
      cols.map((c) => campos[c])
    )
    const row = ins.rows[0]

    await registrarCambio(client, {
      tabla: 'proveedores',
      filaId: Number(row.id),
      accion: 'crear',
      cambios: Object.fromEntries(cols.map((c) => [c, { antes: null, despues: campos[c] }])),
      actor,
    })

    await client.query('COMMIT')
    return NextResponse.json(
      { proveedor: serializarProveedor(row), ...(aviso ? { aviso } : {}) },
      { status: 201 }
    )
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {})
    if ((err as { code?: string })?.code === '23505') {
      return NextResponse.json(await colisionProveedor(pool, campos), { status: 409 })
    }
    console.error('[fiscal/proveedores] POST:', (err as Error)?.message ?? err)
    return NextResponse.json({ error: 'No se pudo crear el proveedor' }, { status: 500 })
  } finally {
    client.release()
  }
}

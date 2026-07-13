/**
 * Cambio de matrícula con historial (tabla vehiculo_matriculas).
 *
 *   GET  /api/vehiculos/[id]/matricula  → historial
 *   POST /api/vehiculos/[id]/matricula  { matricula, motivo?, desde? }
 *
 * La matrícula NO se edita por el PUT genérico: un cambio de matrícula tiene
 * que dejar traza (motivo + fecha) y conservar la anterior como alias, porque
 * las facturas, carpetas de OneDrive y filas de CB ya emitidas se quedan con la
 * matrícula vieja y los cruces la necesitan.
 */

import { NextRequest, NextResponse } from 'next/server'
import { pool } from '@/lib/direct-database'
import { normPlate } from '@/lib/facturasRegistro'

interface FilaHistorial {
  matricula: string
  matricula_norm: string
  desde: string | null
  hasta: string | null
  motivo: string | null
  es_actual: boolean
}

async function tablaExiste(): Promise<boolean> {
  const reg = await pool.query<{ reg: string | null }>(
    `SELECT to_regclass('public.vehiculo_matriculas') AS reg`
  )
  return Boolean(reg.rows[0]?.reg)
}

const SIN_TABLA = {
  error:
    'La tabla vehiculo_matriculas no existe todavía — aplicá create-vehiculo-matriculas.sql',
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const id = parseInt((await params).id, 10)
  if (isNaN(id)) return NextResponse.json({ error: 'ID inválido' }, { status: 400 })
  if (!(await tablaExiste())) return NextResponse.json({ historial: [], anterior: null })

  const res = await pool.query<FilaHistorial>(
    `SELECT matricula, matricula_norm, desde::text, hasta::text, motivo, es_actual
       FROM vehiculo_matriculas
      WHERE vehiculo_id = $1
      ORDER BY es_actual DESC, COALESCE(hasta, CURRENT_DATE) DESC, id DESC`,
    [id]
  )
  const anterior = res.rows.find((r) => !r.es_actual)?.matricula ?? null
  return NextResponse.json({ historial: res.rows, anterior })
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const id = parseInt((await params).id, 10)
  if (isNaN(id)) return NextResponse.json({ error: 'ID inválido' }, { status: 400 })

  const body = await request.json().catch(() => ({}))
  const nueva = String(body?.matricula ?? '').trim().replace(/\s+/g, ' ').toUpperCase()
  const motivo = body?.motivo ? String(body.motivo).trim() : null
  const desde = body?.desde ? String(body.desde) : null
  const nuevaNorm = normPlate(nueva)
  if (!nuevaNorm) {
    return NextResponse.json({ error: 'matricula es obligatoria' }, { status: 400 })
  }
  if (!(await tablaExiste())) return NextResponse.json(SIN_TABLA, { status: 409 })

  const client = await pool.connect()
  try {
    await client.query('BEGIN')

    const veh = await client.query<{ matricula: string | null }>(
      `SELECT matricula FROM "Vehiculo" WHERE id = $1 FOR UPDATE`,
      [id]
    )
    if (veh.rows.length === 0) {
      await client.query('ROLLBACK')
      return NextResponse.json({ error: 'Vehículo no encontrado' }, { status: 404 })
    }
    const actual = veh.rows[0].matricula ?? ''
    const actualNorm = normPlate(actual)
    if (actualNorm === nuevaNorm) {
      await client.query('ROLLBACK')
      return NextResponse.json(
        { error: 'La matrícula nueva es igual a la actual' },
        { status: 409 }
      )
    }

    // La matrícula nueva no puede ser de otro coche (no unir dos vehículos).
    const dueño = await client.query<{ vehiculo_id: number }>(
      `SELECT vehiculo_id FROM vehiculo_matriculas
        WHERE matricula_norm = $1 AND vehiculo_id <> $2
        LIMIT 1`,
      [nuevaNorm, id]
    )
    const otroVeh = await client.query<{ id: number }>(
      `SELECT id FROM "Vehiculo" WHERE matricula_norm = $1 AND id <> $2 LIMIT 1`,
      [nuevaNorm, id]
    )
    const conflicto = dueño.rows[0]?.vehiculo_id ?? otroVeh.rows[0]?.id
    if (conflicto) {
      await client.query('ROLLBACK')
      return NextResponse.json(
        { error: `La matrícula ${nueva} ya pertenece al vehículo ${conflicto}` },
        { status: 409 }
      )
    }

    // La matrícula vigente queda como histórica (y se crea su fila si el
    // backfill nunca la registró).
    if (actualNorm) {
      await client.query(
        `INSERT INTO vehiculo_matriculas (vehiculo_id, matricula, es_actual)
         VALUES ($1, $2, TRUE)
         ON CONFLICT (vehiculo_id, matricula_norm) DO NOTHING`,
        [id, actual]
      )
      await client.query(
        `UPDATE vehiculo_matriculas
            SET es_actual = FALSE, hasta = COALESCE(hasta, $3::date, CURRENT_DATE)
          WHERE vehiculo_id = $1 AND matricula_norm = $2`,
        [id, actualNorm, desde]
      )
    }
    // Cualquier otra fila vigente (datos sucios) también se cierra: el índice
    // único parcial sólo admite una es_actual por coche.
    await client.query(
      `UPDATE vehiculo_matriculas
          SET es_actual = FALSE, hasta = COALESCE(hasta, CURRENT_DATE)
        WHERE vehiculo_id = $1 AND es_actual AND matricula_norm <> $2`,
      [id, nuevaNorm]
    )

    await client.query(
      `INSERT INTO vehiculo_matriculas (vehiculo_id, matricula, desde, motivo, es_actual)
       VALUES ($1, $2, COALESCE($3::date, CURRENT_DATE), $4, TRUE)
       ON CONFLICT (vehiculo_id, matricula_norm)
       DO UPDATE SET es_actual = TRUE, hasta = NULL,
                     desde = COALESCE(EXCLUDED.desde, vehiculo_matriculas.desde),
                     motivo = COALESCE(EXCLUDED.motivo, vehiculo_matriculas.motivo)`,
      [id, nueva, desde, motivo]
    )

    await client.query(`UPDATE "Vehiculo" SET matricula = $1 WHERE id = $2`, [nueva, id])

    const hist = await client.query<FilaHistorial>(
      `SELECT matricula, matricula_norm, desde::text, hasta::text, motivo, es_actual
         FROM vehiculo_matriculas
        WHERE vehiculo_id = $1
        ORDER BY es_actual DESC, id DESC`,
      [id]
    )
    await client.query('COMMIT')

    return NextResponse.json({
      ok: true,
      id,
      matricula: nueva,
      anterior: actual || null,
      historial: hist.rows,
    })
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {})
    const msg = error instanceof Error ? error.message : 'Error desconocido'
    console.error('Error en cambio de matrícula:', msg)
    return NextResponse.json({ error: msg }, { status: 500 })
  } finally {
    client.release()
  }
}

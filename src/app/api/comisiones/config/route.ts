/**
 * PATCH /api/comisiones/config — SOLO admin (requireAdminSession).
 *
 * Actualiza la fila única (id=1) de comision_config. Valida la forma completa
 * del JSON (3 formas de pago × con/sin garantía premium + pctMontoFinanciado,
 * todos números ≥ 0). Si la migración create-comision-config.sql no está
 * aplicada → 503 con hint.
 */

import { NextRequest, NextResponse } from 'next/server'
import { pool } from '@/lib/direct-database'
import { requireAdminSession } from '@/lib/apiAuth'
import { normalizarConfig } from '@/lib/comisiones'

export async function PATCH(request: NextRequest) {
  const auth = requireAdminSession(request)
  if (auth.response) return auth.response

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'JSON inválido' }, { status: 400 })
  }

  const raw =
    typeof body === 'object' && body !== null
      ? ((body as Record<string, unknown>).config ?? body)
      : null
  const config = normalizarConfig(raw)
  if (!config) {
    return NextResponse.json(
      {
        error:
          'config inválida: se espera { base: { contado|financiado|mixto: ' +
          '{ conGarantiaPremium, sinGarantiaPremium } }, pctMontoFinanciado } ' +
          'con todos los valores numéricos ≥ 0',
      },
      { status: 400 }
    )
  }

  try {
    const reg = await pool.query<{ reg: string | null }>(
      `SELECT to_regclass('public.comision_config') AS reg`
    )
    if (!reg.rows[0]?.reg) {
      return NextResponse.json(
        {
          error:
            'La tabla comision_config no existe todavía — aplicar create-comision-config.sql',
        },
        { status: 503 }
      )
    }

    const res = await pool.query(
      `INSERT INTO comision_config (id, config, updated_by, updated_at)
       VALUES (1, $1::jsonb, $2, NOW())
       ON CONFLICT (id) DO UPDATE SET
         config = EXCLUDED.config,
         updated_by = EXCLUDED.updated_by,
         updated_at = NOW()
       RETURNING config, updated_at, updated_by`,
      [JSON.stringify(config), `uid:${auth.session.uid}`]
    )

    return NextResponse.json({
      config: res.rows[0].config,
      updated_at: res.rows[0].updated_at,
      updated_by: res.rows[0].updated_by,
    })
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 })
  }
}

/**
 * GET/POST /api/deals/[id]/condiciones-pago
 *
 * Condiciones de pago obligatorias del contrato de venta. El POST se dispara
 * en el mismo submit que genera el contrato: si falla, el contrato NO se
 * genera. Upsert por deal_id (una fila por deal). Sesión normal (middleware).
 * Si la migración create-venta-condiciones-pago.sql no está aplicada → 503.
 */

import { NextRequest, NextResponse } from 'next/server'
import { pool } from '@/lib/direct-database'
import { requireApiSession } from '@/lib/apiAuth'
import { validarCondicionesPago } from '@/lib/ventaCondicionesPago'

const HINT_TABLA =
  'La tabla venta_condiciones_pago no existe todavía — aplicar create-venta-condiciones-pago.sql'

async function tablaExiste(): Promise<boolean> {
  const reg = await pool.query<{ reg: string | null }>(
    `SELECT to_regclass('public.venta_condiciones_pago') AS reg`
  )
  return Boolean(reg.rows[0]?.reg)
}

function parseDealId(id: string): number | null {
  const dealId = parseInt(id, 10)
  return Number.isNaN(dealId) || dealId <= 0 ? null : dealId
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = requireApiSession(request)
  if (auth.response) return auth.response

  const dealId = parseDealId((await params).id)
  if (dealId === null) {
    return NextResponse.json({ error: 'ID de deal inválido' }, { status: 400 })
  }

  try {
    if (!(await tablaExiste())) {
      return NextResponse.json({ error: HINT_TABLA }, { status: 503 })
    }
    const res = await pool.query(
      `SELECT deal_id, forma_pago, banco, interes, cuotas, monto_financiado,
              monto_contado, garantia_premium, created_at, updated_at
         FROM venta_condiciones_pago
        WHERE deal_id = $1`,
      [dealId]
    )
    return NextResponse.json({ condiciones: res.rows[0] ?? null })
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 })
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = requireApiSession(request)
  if (auth.response) return auth.response

  const dealId = parseDealId((await params).id)
  if (dealId === null) {
    return NextResponse.json({ error: 'ID de deal inválido' }, { status: 400 })
  }

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'JSON inválido' }, { status: 400 })
  }

  try {
    if (!(await tablaExiste())) {
      return NextResponse.json({ error: HINT_TABLA }, { status: 503 })
    }

    const dealRes = await pool.query<{ importeTotal: string | null }>(
      `SELECT "importeTotal" FROM "Deal" WHERE id = $1`,
      [dealId]
    )
    if (dealRes.rows.length === 0) {
      return NextResponse.json({ error: 'Deal no encontrado' }, { status: 404 })
    }
    const precioVenta =
      dealRes.rows[0].importeTotal != null
        ? Number(dealRes.rows[0].importeTotal)
        : null

    const val = validarCondicionesPago(body, precioVenta)
    if (!val.ok) {
      return NextResponse.json({ error: val.error }, { status: 400 })
    }
    const c = val.data

    const upsert = await pool.query(
      `INSERT INTO venta_condiciones_pago
         (deal_id, forma_pago, banco, interes, cuotas, monto_financiado,
          monto_contado, garantia_premium)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       ON CONFLICT (deal_id) DO UPDATE SET
         forma_pago = EXCLUDED.forma_pago,
         banco = EXCLUDED.banco,
         interes = EXCLUDED.interes,
         cuotas = EXCLUDED.cuotas,
         monto_financiado = EXCLUDED.monto_financiado,
         monto_contado = EXCLUDED.monto_contado,
         garantia_premium = EXCLUDED.garantia_premium,
         updated_at = NOW()
       RETURNING deal_id, forma_pago, banco, interes, cuotas, monto_financiado,
                 monto_contado, garantia_premium, created_at, updated_at`,
      [
        dealId,
        c.formaPago,
        c.banco,
        c.interes,
        c.cuotas,
        c.montoFinanciado,
        c.montoContado,
        c.garantiaPremium,
      ]
    )

    return NextResponse.json({ condiciones: upsert.rows[0] })
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 })
  }
}

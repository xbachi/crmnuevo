/**
 * GET /api/ventas/unificadas
 *
 * Lista ÚNICA de ventas: retail (Deal) + B2B (venta_b2b). Una sola query con
 * UNION ALL, orden y paginación en SQL, más los contadores y los KPIs de
 * mes/trimestre agregados sobre el conjunto completo (las dos vías).
 *
 * Query params: tipo=todas|retail|b2b, estado=todos|nuevo|reservado|vendido|
 * facturado|anulado, q, desde, hasta (YYYY-MM-DD), page, pageSize.
 */

import { NextRequest, NextResponse } from 'next/server'
import { pool } from '@/lib/direct-database'
import { requireApiSession } from '@/lib/apiAuth'
import {
  buildVentasUnificadasQuery,
  mapVentaRow,
  parseVentasFiltros,
  type VentaRowDb,
} from '@/lib/ventasUnificadas'

interface Payload {
  rows: VentaRowDb[]
  total: string | number
  contadores: Record<string, number>
  totales: Record<string, string | number>
}

export async function GET(request: NextRequest) {
  const auth = requireApiSession(request)
  if (auth.response) return auth.response

  const filtros = parseVentasFiltros(request.nextUrl.searchParams)
  const { sql, params } = buildVentasUnificadasQuery(filtros)

  try {
    const { rows } = await pool.query<{ payload: Payload }>(sql, params)
    const payload = rows[0]?.payload

    const total = Number(payload?.total ?? 0)
    const numerico = (v: string | number | undefined) => Number(v ?? 0)
    const t = payload?.totales ?? {}

    return NextResponse.json({
      ventas: (payload?.rows ?? []).map(mapVentaRow),
      page: filtros.page,
      pageSize: filtros.pageSize,
      total,
      totalPages: Math.max(1, Math.ceil(total / filtros.pageSize)),
      filtros: {
        tipo: filtros.tipo,
        estado: filtros.estado,
        q: filtros.q,
        desde: filtros.desde,
        hasta: filtros.hasta,
      },
      contadores: payload?.contadores ?? {},
      totales: {
        mesVentas: numerico(t.mesVentas),
        mesImporte: numerico(t.mesImporte),
        mesB2B: numerico(t.mesB2B),
        trimestreVentas: numerico(t.trimestreVentas),
        trimestreImporte: numerico(t.trimestreImporte),
        trimestreB2B: numerico(t.trimestreB2B),
        sinFacturar: numerico(t.sinFacturar),
      },
    })
  } catch (error) {
    console.error('[GET /api/ventas/unificadas]', error)
    return NextResponse.json(
      { error: 'Error al obtener las ventas' },
      { status: 500 }
    )
  }
}

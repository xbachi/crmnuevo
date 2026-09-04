/**
 * GET /api/admin/stock-aging
 *
 * Stock aging / recon tracking (patrón vAuto): por cada vehículo NO vendido,
 * días en stock (desde fechaCompra o createdAt), coste acumulado (compra +
 * gastos por tipo), margen estimado contra precio de venta previsto y alertas:
 * margen-negativo, aging-60/90, sin-precio-compra, gastos-sin-coste-base.
 * Orden: más días primero. Protegido por X-Admin-Secret. Sólo lee.
 *
 * La lógica vive en src/lib/stockAging.ts (compartida con el cron de alertas).
 */

import { NextRequest, NextResponse } from 'next/server'
import { safeEqual } from '@/lib/secrets'
import { getStockAging } from '@/lib/stockAging'

export async function GET(request: NextRequest) {
  const secret =
    process.env.ADMIN_SECRET ?? process.env.N8N_INVOICE_WEBHOOK_SECRET ?? ''
  if (!secret || !safeEqual(request.headers.get('x-admin-secret'), secret)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  try {
    const { resumen, vehiculos } = await getStockAging()
    return NextResponse.json({ resumen, vehiculos })
  } catch (e) {
    console.error('stock-aging error:', e)
    return NextResponse.json({ error: 'internal error' }, { status: 500 })
  }
}

import { NextResponse } from 'next/server'
import { listSequences } from '@/lib/invoiceRepository'

/**
 * GET /api/invoice-sequences
 *
 * Returns all invoice sequences (active and inactive). Used by
 * /facturacion/series.
 */
export async function GET() {
  try {
    const rows = await listSequences()
    return NextResponse.json({ rows })
  } catch (err) {
    console.error('[invoice-sequences GET]', err)
    return NextResponse.json(
      { error: 'Error al cargar las series' },
      { status: 500 }
    )
  }
}

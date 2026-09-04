import { NextRequest, NextResponse } from 'next/server'
import { getDeals, createDeal } from '@/lib/direct-database'

export async function GET() {
  try {
    const deals = await getDeals()
    return NextResponse.json(deals, {
      headers: { 'Cache-Control': 'private, max-age=30' },
    })
  } catch (error) {
    console.error('Error al obtener deals:', error)
    return NextResponse.json({ error: 'Error interno del servidor' }, { status: 500 })
  }
}

// Fecha vacía o inválida → null (nunca reventar el INSERT por un string raro)
function parseFecha(value: unknown): Date | null {
  if (value === null || value === undefined || value === '') return null
  const d = new Date(value as string | number | Date)
  return Number.isNaN(d.getTime()) ? null : d
}

function parseNumero(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null
  const n = Number(value)
  return Number.isFinite(n) ? n : null
}

export async function POST(request: NextRequest) {
  try {
    const data = await request.json()
    
    // Validaciones básicas
    if (!data.clienteId) {
      return NextResponse.json({ error: 'El cliente es obligatorio' }, { status: 400 })
    }
    
    if (!data.vehiculoId) {
      return NextResponse.json({ error: 'El vehículo es obligatorio' }, { status: 400 })
    }
    
    const deal = await createDeal({
      clienteId: parseInt(data.clienteId),
      vehiculoId: parseInt(data.vehiculoId),
      importeTotal: data.importeTotal ? parseFloat(data.importeTotal) : undefined,
      importeSena: data.importeSena ? parseFloat(data.importeSena) : undefined,
      formaPagoSena: data.formaPagoSena,
      restoAPagar: parseNumero(data.restoAPagar),
      financiacion: Boolean(data.financiacion),
      entidadFinanciera: data.entidadFinanciera
        ? String(data.entidadFinanciera)
        : null,
      fechaReservaDesde: parseFecha(data.fechaReservaDesde),
      fechaReservaExpira: parseFecha(data.fechaReservaExpira),
      observaciones: data.observaciones,
      responsableComercial: data.responsableComercial || 'Usuario'
    })
    
    return NextResponse.json(deal, { status: 201 })
  } catch (error) {
    console.error('Error creando deal:', error)
    return NextResponse.json({ error: 'Error interno del servidor' }, { status: 500 })
  }
}

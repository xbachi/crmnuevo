import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { enforceInvoicesApiKey } from '@/lib/invoices/api-auth'

export async function GET(request: NextRequest) {
  try {
    enforceInvoicesApiKey(request)
    const docs = await prisma.accountingDocument.findMany({
      where: {
        status: { in: ['PENDING', 'NEEDS_REVIEW'] },
      },
      orderBy: { createdAt: 'desc' },
      take: 200,
      include: {
        invoice: {
          include: {
            vendor: true,
            vehiculo: {
              select: { id: true, matricula: true, referencia: true },
            },
          },
        },
      },
    })

    return NextResponse.json({ items: docs })
  } catch (e: any) {
    if (e?.status === 401) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    return NextResponse.json(
      { error: e?.message || 'Error cargando pendientes' },
      { status: 500 }
    )
  }
}

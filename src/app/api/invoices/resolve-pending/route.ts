import { NextRequest, NextResponse } from 'next/server'
import { getInvoicesQueue } from '@/lib/invoices/queue'
import type { ExpenseCategory } from '@/lib/invoices/domain'
import { enforceInvoicesApiKey } from '@/lib/invoices/api-auth'

type Body = {
  documentId: number
  vehiculoId: number
  category: ExpenseCategory
}

export async function POST(req: NextRequest) {
  try {
    enforceInvoicesApiKey(req)
    const body = (await req.json()) as Body

    if (!body?.documentId || !body?.vehiculoId || !body?.category) {
      return NextResponse.json(
        { error: 'documentId, vehiculoId y category son obligatorios' },
        { status: 400 }
      )
    }

    const queue = getInvoicesQueue()
    const jobId = `invoice:resolve:${body.documentId}:${body.vehiculoId}:${body.category}`

    const job = await queue.add(
      'resolve_pending',
      {
        kind: 'resolve_pending',
        documentId: body.documentId,
        vehiculoId: body.vehiculoId,
        category: body.category,
      },
      { jobId }
    )

    return NextResponse.json({ ok: true, jobId: job.id }, { status: 202 })
  } catch (e: any) {
    if (e?.status === 401) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    return NextResponse.json(
      { error: e?.message || 'Error resolviendo pendiente' },
      { status: 500 }
    )
  }
}

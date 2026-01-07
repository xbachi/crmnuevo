import { NextRequest, NextResponse } from 'next/server'
import { getInvoicesQueue } from '@/lib/invoices/queue'
import type { InvoiceSource } from '@/lib/invoices/domain'
import { enforceInvoicesApiKey } from '@/lib/invoices/api-auth'

type Body = {
  source?: string
  oneDriveItemId?: string
  oneDrivePath?: string

  // Outlook (optional)
  outlookUserId?: string
  outlookMessageId?: string
  outlookAttachmentId?: string
}

function parseSource(raw?: string): InvoiceSource {
  const v = (raw || '').toLowerCase()
  if (v === 'onedrive') return 'ONEDRIVE'
  if (v === 'outlook') return 'OUTLOOK'
  if (v === 'manual') return 'MANUAL'
  throw new Error('Invalid source')
}

export async function POST(req: NextRequest) {
  try {
    enforceInvoicesApiKey(req)
    const body = (await req.json()) as Body
    const source = parseSource(body.source)

    const hasOneDrive = !!(body.oneDriveItemId || body.oneDrivePath)
    const hasOutlook = !!(body.outlookMessageId && body.outlookAttachmentId)

    if (!hasOneDrive && !hasOutlook) {
      return NextResponse.json(
        {
          error:
            'Debe enviar oneDriveItemId/oneDrivePath (OneDrive) o outlookMessageId+outlookAttachmentId (Outlook)',
        },
        { status: 400 }
      )
    }

    const queue = getInvoicesQueue()
    const key =
      body.oneDriveItemId ||
      body.oneDrivePath ||
      `${body.outlookMessageId}:${body.outlookAttachmentId}`
    const jobId = `invoice:process:${source}:${key}`

    const job = await queue.add(
      'process',
      {
        kind: 'process',
        source,
        oneDriveItemId: body.oneDriveItemId,
        oneDrivePath: body.oneDrivePath,
        outlookUserId: body.outlookUserId,
        outlookMessageId: body.outlookMessageId,
        outlookAttachmentId: body.outlookAttachmentId,
      },
      { jobId }
    )

    return NextResponse.json({ ok: true, jobId: job.id }, { status: 202 })
  } catch (e: any) {
    if (e?.status === 401) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    return NextResponse.json(
      { error: e?.message || 'Error ingestando factura' },
      { status: 500 }
    )
  }
}

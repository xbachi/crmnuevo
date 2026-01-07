import 'dotenv/config'
import { Worker } from 'bullmq'
import { prisma } from '@/lib/prisma'
import { logger } from '@/lib/logger'
import { getBullConnection } from '@/lib/invoices/bull-connection'
import { INVOICES_QUEUE_NAME, type InvoiceJobData } from '@/lib/invoices/queue'
import {
  processInvoiceFromOneDrive,
  processInvoiceFromOutlook,
  resolvePendingInvoice,
} from '@/lib/invoices/process'

async function main() {
  logger.info('[WORKER] Starting invoices worker...')

  const worker = new Worker<InvoiceJobData>(
    INVOICES_QUEUE_NAME,
    async (job) => {
      logger.info('[WORKER] Job start', {
        id: job.id,
        name: job.name,
        data: job.data,
      })
      const data = job.data

      if (data.kind === 'process') {
        if (data.source === 'OUTLOOK') {
          return processInvoiceFromOutlook({
            source: data.source,
            oneDriveItemId: data.oneDriveItemId,
            oneDrivePath: data.oneDrivePath,
            outlookUserId: data.outlookUserId,
            outlookMessageId: data.outlookMessageId,
            outlookAttachmentId: data.outlookAttachmentId,
          })
        }

        return processInvoiceFromOneDrive({
          source: data.source,
          oneDriveItemId: data.oneDriveItemId,
          oneDrivePath: data.oneDrivePath,
        })
      }

      if (data.kind === 'resolve_pending') {
        return resolvePendingInvoice({
          documentId: data.documentId,
          vehiculoId: data.vehiculoId,
          category: data.category,
        })
      }

      throw new Error(`Unknown job kind: ${(data as any).kind}`)
    },
    {
      connection: getBullConnection(),
      concurrency: Number(process.env.INVOICES_WORKER_CONCURRENCY || 4),
    }
  )

  worker.on('completed', (job, result) => {
    logger.info('[WORKER] Job completed', { id: job.id, result })
  })
  worker.on('failed', (job, err) => {
    logger.error('[WORKER] Job failed', { id: job?.id, err: String(err) })
  })

  const shutdown = async () => {
    logger.warn('[WORKER] Shutting down...')
    await worker.close()
    await prisma.$disconnect()
    process.exit(0)
  }

  process.on('SIGINT', shutdown)
  process.on('SIGTERM', shutdown)
}

main().catch((e) => {
  logger.error('[WORKER] Fatal', e)
  process.exit(1)
})

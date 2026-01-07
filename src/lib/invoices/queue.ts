import { Queue } from 'bullmq'
import type { ExpenseCategory, InvoiceSource } from '@/lib/invoices/domain'
import { getBullConnection } from '@/lib/invoices/bull-connection'

export const INVOICES_QUEUE_NAME = 'invoices'

export type InvoiceProcessJobData = {
  kind: 'process'
  source: InvoiceSource
  oneDriveItemId?: string
  oneDrivePath?: string

  // Outlook ingestion (optional): worker will download attachment and upload to OneDrive INBOX
  outlookUserId?: string
  outlookMessageId?: string
  outlookAttachmentId?: string
}

export type InvoiceResolvePendingJobData = {
  kind: 'resolve_pending'
  documentId: number
  vehiculoId: number
  category: ExpenseCategory
}

export type InvoiceJobData =
  | InvoiceProcessJobData
  | InvoiceResolvePendingJobData

const globalForQueue = globalThis as unknown as {
  invoicesQueue: Queue | undefined
}

export function getInvoicesQueue() {
  if (!globalForQueue.invoicesQueue) {
    // BullMQ generics are quite complex; keep runtime-safe typing simple here.
    globalForQueue.invoicesQueue = new Queue(INVOICES_QUEUE_NAME, {
      connection: getBullConnection(),
      defaultJobOptions: {
        attempts: 5,
        backoff: { type: 'exponential', delay: 5_000 },
        removeOnComplete: { age: 60 * 60 * 24 * 7, count: 5000 },
        removeOnFail: { age: 60 * 60 * 24 * 30, count: 5000 },
      },
    })
  }
  return globalForQueue.invoicesQueue as Queue<InvoiceJobData>
}

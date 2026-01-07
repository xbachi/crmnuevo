import type { ExpenseCategory, InvoiceSource } from '@/lib/invoices/domain'
import { prisma } from '@/lib/prisma'
import { logger } from '@/lib/logger'
import { classifyCategory } from './classify'
import { extractInvoiceFields } from './extract'
import { fingerprintHex, sha256Hex } from './hash'
import { extractPdfText } from './pdf'
import { buildExpedienteDestinationPath } from './paths'
import {
  downloadItemContent,
  ensureFolderByPath,
  getItemById,
  getItemByPath,
  moveItemToFolder,
  uploadFileToPath,
} from './onedrive'
import { findOrCreateVendor } from './vendor'
import { downloadOutlookAttachment } from './outlook'

function getBaseRoot() {
  return process.env.MS_GRAPH_BASE_PATH || '/Concesionaria'
}

function toRootRelativePath(path: string) {
  const base = getBaseRoot().replace(/\/+$/, '')
  // Allow callers to pass absolute /Concesionaria/...
  if (path.startsWith(base)) return path.replace(base, '') || '/'
  if (path.startsWith('/')) return path
  return `/${path}`
}

function safeFilename(name: string) {
  return name.replace(/[<>:"\\|?*\x00-\x1F]/g, '_').trim()
}

export type ProcessInvoiceInput = {
  source: InvoiceSource
  oneDriveItemId?: string
  oneDrivePath?: string

  outlookUserId?: string
  outlookMessageId?: string
  outlookAttachmentId?: string
}

export type ProcessInvoiceResult =
  | { outcome: 'processed'; documentId: number }
  | { outcome: 'pending'; documentId: number; reason: string }
  | { outcome: 'duplicate'; existingDocumentId?: number; reason: string }

export async function processInvoiceFromOneDrive(
  input: ProcessInvoiceInput
): Promise<ProcessInvoiceResult> {
  if (!input.oneDriveItemId && !input.oneDrivePath) {
    throw new Error('Missing oneDriveItemId or oneDrivePath')
  }

  // 1) Resolve item metadata
  const item = input.oneDriveItemId
    ? await getItemById(input.oneDriveItemId)
    : await getItemByPath(toRootRelativePath(input.oneDrivePath!))

  const itemId = item.id
  const originalFilename = safeFilename(item.name || 'factura.pdf')

  // 2) Download bytes and compute sha
  const bytes = await downloadItemContent(itemId)
  const sha256 = sha256Hex(bytes)

  // 3) Level-1 dedupe (sha256)
  const existingBySha = await prisma.accountingDocument.findUnique({
    where: { sha256 },
    select: { id: true },
  })
  if (existingBySha) {
    logger.warn('[INVOICES] Duplicate by sha256, moving to DUPLICADAS', {
      sha256,
      itemId,
      existingDocumentId: existingBySha.id,
    })
    const dupFolder = await ensureFolderByPath(
      toRootRelativePath(`${getBaseRoot()}/FACTURAS_DUPLICADAS`)
    )
    await moveItemToFolder(itemId, dupFolder.id)
    return {
      outcome: 'duplicate',
      existingDocumentId: existingBySha.id,
      reason: 'sha256',
    }
  }

  // 4) Create document row (idempotent via sha unique)
  let doc = await prisma.accountingDocument
    .create({
      data: {
        source: input.source,
        oneDriveItemId: itemId,
        oneDrivePath: input.oneDrivePath || null,
        originalFilename,
        sha256,
        status: 'PROCESSING',
        graphWebUrl: item.webUrl || null,
        processingAttempts: 1,
        lastProcessedAt: new Date(),
      },
      select: { id: true },
    })
    .catch(async (e: any) => {
      // If another worker created it concurrently, treat as duplicate
      const existing = await prisma.accountingDocument.findUnique({
        where: { sha256 },
        select: { id: true },
      })
      if (existing) {
        return existing
      }
      throw e
    })

  // 5) Parse PDF text (no OCR)
  const pdf = await extractPdfText(bytes)
  if (!pdf.hasText) {
    const pendingFolder = await ensureFolderByPath(
      toRootRelativePath(`${getBaseRoot()}/FACTURAS_PENDIENTES`)
    )
    const moved = await moveItemToFolder(itemId, pendingFolder.id)
    await prisma.accountingDocument.update({
      where: { id: doc.id },
      data: {
        status: 'NEEDS_REVIEW',
        reason: 'requiere OCR (PDF sin texto)',
        finalOneDriveItemId: moved.id,
        finalOneDrivePath: `${getBaseRoot()}/FACTURAS_PENDIENTES/${moved.name}`,
        graphWebUrl: moved.webUrl || null,
      },
    })
    await prisma.accountingInvoice.upsert({
      where: { documentId: doc.id },
      create: {
        documentId: doc.id,
        confidence: 0,
      },
      update: {},
    })
    return { outcome: 'pending', documentId: doc.id, reason: 'requires_ocr' }
  }

  // 6) Extract fields + classify
  const extracted = extractInvoiceFields(pdf.text)
  const vendor = await findOrCreateVendor({
    nif: extracted.vendorNif,
    iban: extracted.vendorIban,
    normalizedText: extracted.normalizedText,
  })

  const category: ExpenseCategory =
    (vendor?.defaultCategory as ExpenseCategory | null) ||
    classifyCategory(pdf.text)

  // 7) Fingerprint (level-3 dedupe)
  const fp = fingerprintHex([
    extracted.vendorNif,
    extracted.invoiceDate?.toISOString(),
    extracted.total,
    extracted.base,
    extracted.iva,
    extracted.invoiceNumber,
    extracted.normalizedText.slice(0, 2000),
  ])

  const existingByFp = await prisma.accountingDocument.findUnique({
    where: { contentFingerprint: fp },
    select: { id: true },
  })
  if (existingByFp) {
    logger.warn('[INVOICES] Duplicate by contentFingerprint', {
      docId: doc.id,
      fp,
      existingDocumentId: existingByFp.id,
    })
    const dupFolder = await ensureFolderByPath(
      toRootRelativePath(`${getBaseRoot()}/FACTURAS_DUPLICADAS`)
    )
    const moved = await moveItemToFolder(itemId, dupFolder.id)
    await prisma.accountingDocument.update({
      where: { id: doc.id },
      data: {
        status: 'DUPLICATE',
        reason: 'duplicate fingerprint',
        contentFingerprint: fp,
        finalOneDriveItemId: moved.id,
        finalOneDrivePath: `${getBaseRoot()}/FACTURAS_DUPLICADAS/${moved.name}`,
        graphWebUrl: moved.webUrl || null,
      },
    })
    return {
      outcome: 'duplicate',
      existingDocumentId: existingByFp.id,
      reason: 'fingerprint',
    }
  }

  // 8) Level-2 dedupe (vendor + invoiceNumber)
  if (vendor?.id && extracted.invoiceNumber) {
    const existingInvoice = await prisma.accountingInvoice.findFirst({
      where: {
        vendorId: vendor.id,
        invoiceNumber: extracted.invoiceNumber,
      },
      select: { id: true, documentId: true },
    })
    if (existingInvoice) {
      const dupFolder = await ensureFolderByPath(
        toRootRelativePath(`${getBaseRoot()}/FACTURAS_DUPLICADAS`)
      )
      const moved = await moveItemToFolder(itemId, dupFolder.id)
      await prisma.accountingDocument.update({
        where: { id: doc.id },
        data: {
          status: 'DUPLICATE',
          reason: 'duplicate vendor+invoiceNumber',
          contentFingerprint: fp,
          finalOneDriveItemId: moved.id,
          finalOneDrivePath: `${getBaseRoot()}/FACTURAS_DUPLICADAS/${moved.name}`,
          graphWebUrl: moved.webUrl || null,
        },
      })
      return {
        outcome: 'duplicate',
        existingDocumentId: existingInvoice.documentId,
        reason: 'vendor+invoiceNumber',
      }
    }
  }

  // 9) Try match vehicle by matricula
  let vehiculo = null as null | {
    id: number
    matricula: string
    referencia: string
  }
  if (extracted.matricula) {
    vehiculo = await prisma.vehiculo.findFirst({
      where: { matricula: extracted.matricula },
      select: { id: true, matricula: true, referencia: true },
    })
  }

  // 10) Always create/update invoice row for tracking
  await prisma.accountingInvoice.upsert({
    where: { documentId: doc.id },
    create: {
      documentId: doc.id,
      vendorId: vendor?.id ?? null,
      invoiceNumber: extracted.invoiceNumber ?? null,
      invoiceDate: extracted.invoiceDate ?? null,
      base: extracted.base ?? null,
      iva: extracted.iva ?? null,
      total: extracted.total ?? null,
      currency: 'EUR',
      vehiculoId: vehiculo?.id ?? null,
      matricula: extracted.matricula ?? null,
      category,
      confidence: extracted.confidence,
    },
    update: {
      vendorId: vendor?.id ?? null,
      invoiceNumber: extracted.invoiceNumber ?? null,
      invoiceDate: extracted.invoiceDate ?? null,
      base: extracted.base ?? null,
      iva: extracted.iva ?? null,
      total: extracted.total ?? null,
      vehiculoId: vehiculo?.id ?? null,
      matricula: extracted.matricula ?? null,
      category,
      confidence: extracted.confidence,
    },
  })

  // 11) Update document fingerprint
  await prisma.accountingDocument.update({
    where: { id: doc.id },
    data: { contentFingerprint: fp },
  })

  if (!vehiculo || !extracted.matricula || extracted.confidence < 55) {
    const pendingFolder = await ensureFolderByPath(
      toRootRelativePath(`${getBaseRoot()}/FACTURAS_PENDIENTES`)
    )
    const moved = await moveItemToFolder(itemId, pendingFolder.id)
    const reason = !extracted.matricula
      ? 'no se detectó matrícula'
      : !vehiculo
        ? 'matrícula no encontrada en CRM'
        : 'baja confianza'

    await prisma.accountingDocument.update({
      where: { id: doc.id },
      data: {
        status: 'PENDING',
        reason,
        finalOneDriveItemId: moved.id,
        finalOneDrivePath: `${getBaseRoot()}/FACTURAS_PENDIENTES/${moved.name}`,
        graphWebUrl: moved.webUrl || null,
      },
    })

    return { outcome: 'pending', documentId: doc.id, reason }
  }

  // 12) Move to expediente folder and create expense row
  const destPath = buildExpedienteDestinationPath({
    vehiculo,
    category,
    filename: originalFilename,
  })
  const destFolderPath = destPath.split('/').slice(0, -1).join('/')
  const destFolder = await ensureFolderByPath(
    toRootRelativePath(destFolderPath)
  )
  const moved = await moveItemToFolder(itemId, destFolder.id, originalFilename)

  await prisma.accountingDocument.update({
    where: { id: doc.id },
    data: {
      status: 'PROCESSED',
      reason: null,
      finalOneDriveItemId: moved.id,
      finalOneDrivePath: `${destFolderPath}/${moved.name}`,
      graphWebUrl: moved.webUrl || null,
    },
  })

  const invoice = await prisma.accountingInvoice.findUnique({
    where: { documentId: doc.id },
    select: { id: true, base: true, iva: true, total: true, currency: true },
  })

  if (invoice) {
    await prisma.accountingVehicleExpense.upsert({
      where: { invoiceId: invoice.id },
      create: {
        vehiculoId: vehiculo.id,
        invoiceId: invoice.id,
        category,
        base: invoice.base,
        iva: invoice.iva,
        total: invoice.total,
        currency: invoice.currency ?? 'EUR',
        documentUrl: moved.webUrl || item.webUrl || null,
      },
      update: {
        category,
        base: invoice.base,
        iva: invoice.iva,
        total: invoice.total,
        currency: invoice.currency ?? 'EUR',
        documentUrl: moved.webUrl || item.webUrl || null,
      },
    })
  }

  return { outcome: 'processed', documentId: doc.id }
}

export async function processInvoiceFromOutlook(
  input: ProcessInvoiceInput
): Promise<ProcessInvoiceResult> {
  const userId = input.outlookUserId || process.env.MS_GRAPH_MAILBOX_USER_ID
  const messageId = input.outlookMessageId
  const attachmentId = input.outlookAttachmentId

  if (!userId || !messageId || !attachmentId) {
    throw new Error(
      'Missing outlookUserId/MS_GRAPH_MAILBOX_USER_ID, outlookMessageId, outlookAttachmentId'
    )
  }

  const { filename, bytes } = await downloadOutlookAttachment({
    userId,
    messageId,
    attachmentId,
  })

  const ym = new Date()
  const yyyy = ym.getFullYear()
  const mm = String(ym.getMonth() + 1).padStart(2, '0')
  const folder = `${getBaseRoot()}/FACTURAS_INBOX/${yyyy}-${mm}`

  await ensureFolderByPath(toRootRelativePath(folder))
  const uploaded = await uploadFileToPath(
    toRootRelativePath(`${folder}/${safeFilename(filename)}`),
    bytes
  )

  return processInvoiceFromOneDrive({
    source: 'OUTLOOK',
    oneDriveItemId: uploaded.id,
    oneDrivePath: `${folder}/${uploaded.name}`,
  })
}

export async function resolvePendingInvoice(params: {
  documentId: number
  vehiculoId: number
  category: ExpenseCategory
}) {
  const doc = await prisma.accountingDocument.findUnique({
    where: { id: params.documentId },
  })
  if (!doc) throw new Error('Documento no encontrado')

  const invoice = await prisma.accountingInvoice.findUnique({
    where: { documentId: params.documentId },
  })

  const vehiculo = await prisma.vehiculo.findUnique({
    where: { id: params.vehiculoId },
    select: { id: true, matricula: true, referencia: true },
  })
  if (!vehiculo) throw new Error('Vehículo no encontrado')

  if (!doc.finalOneDriveItemId && !doc.oneDriveItemId) {
    throw new Error('Documento sin OneDrive itemId')
  }
  const itemId = doc.finalOneDriveItemId || doc.oneDriveItemId!

  const filename = safeFilename(doc.originalFilename || 'factura.pdf')
  const destPath = buildExpedienteDestinationPath({
    vehiculo,
    category: params.category,
    filename,
  })
  const destFolderPath = destPath.split('/').slice(0, -1).join('/')
  const destFolder = await ensureFolderByPath(
    toRootRelativePath(destFolderPath)
  )
  const moved = await moveItemToFolder(itemId, destFolder.id, filename)

  // Update invoice + doc + expense
  const updatedInvoice = await prisma.accountingInvoice.upsert({
    where: { documentId: params.documentId },
    create: {
      documentId: params.documentId,
      vehiculoId: vehiculo.id,
      matricula: vehiculo.matricula,
      category: params.category,
      confidence: invoice?.confidence ?? 0,
    },
    update: {
      vehiculoId: vehiculo.id,
      matricula: vehiculo.matricula,
      category: params.category,
    },
  })

  await prisma.accountingDocument.update({
    where: { id: params.documentId },
    data: {
      status: 'PROCESSED',
      reason: null,
      finalOneDriveItemId: moved.id,
      finalOneDrivePath: `${destFolderPath}/${moved.name}`,
      graphWebUrl: moved.webUrl || doc.graphWebUrl || null,
    },
  })

  await prisma.accountingVehicleExpense.upsert({
    where: { invoiceId: updatedInvoice.id },
    create: {
      vehiculoId: vehiculo.id,
      invoiceId: updatedInvoice.id,
      category: params.category,
      base: updatedInvoice.base,
      iva: updatedInvoice.iva,
      total: updatedInvoice.total,
      currency: updatedInvoice.currency ?? 'EUR',
      documentUrl: moved.webUrl || doc.graphWebUrl || null,
    },
    update: {
      category: params.category,
      base: updatedInvoice.base,
      iva: updatedInvoice.iva,
      total: updatedInvoice.total,
      currency: updatedInvoice.currency ?? 'EUR',
      documentUrl: moved.webUrl || doc.graphWebUrl || null,
    },
  })

  return { ok: true }
}

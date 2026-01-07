import { graphRequest } from './msgraph'

type FileAttachment = {
  '@odata.type'?: string
  id: string
  name?: string
  contentType?: string
  contentBytes?: string
}

export async function downloadOutlookAttachment(params: {
  userId: string
  messageId: string
  attachmentId: string
}) {
  const att = await graphRequest<FileAttachment>(
    `/users/${encodeURIComponent(params.userId)}/messages/${encodeURIComponent(params.messageId)}/attachments/${encodeURIComponent(params.attachmentId)}`
  )

  const b64 = att.contentBytes
  if (!b64) {
    throw new Error(
      'Outlook attachment without contentBytes (not a file attachment?)'
    )
  }

  const bytes = Buffer.from(b64, 'base64')
  const filename = att.name || 'attachment.pdf'

  return { filename, bytes, contentType: att.contentType || null }
}

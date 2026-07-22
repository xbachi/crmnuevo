/**
 * Envío de email transaccional vía SMTP (cuenta hola@sevencars.es, IONOS/1&1 —
 * la misma que usa n8n para IMAP). Config por env: SMTP_PASS (requerida),
 * SMTP_HOST/SMTP_PORT/SMTP_USER opcionales. Sin SMTP_PASS el mailer queda
 * deshabilitado y sendMail devuelve {sent:false} sin romper nada.
 */
import nodemailer from 'nodemailer'

const HOST = process.env.SMTP_HOST || 'smtp.1und1.de'
const PORT = Number(process.env.SMTP_PORT || 465)
const USER = process.env.SMTP_USER || 'hola@sevencars.es'

export interface MailResult {
  sent: boolean
  reason?: string
}

export async function sendMail(opts: {
  to: string
  subject: string
  html: string
  text?: string
}): Promise<MailResult> {
  const pass = process.env.SMTP_PASS
  if (!pass) return { sent: false, reason: 'SMTP_PASS no configurada' }
  try {
    const transport = nodemailer.createTransport({
      host: HOST,
      port: PORT,
      secure: PORT === 465,
      auth: { user: USER, pass },
    })
    await transport.sendMail({
      from: `"SevenCars" <${USER}>`,
      to: opts.to,
      subject: opts.subject,
      html: opts.html,
      text: opts.text,
    })
    return { sent: true }
  } catch (err) {
    return { sent: false, reason: (err as Error)?.message ?? String(err) }
  }
}

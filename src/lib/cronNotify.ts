/**
 * Aviso por email cuando un cron falla (A6). Best-effort: nunca lanza.
 * Destinatario: ALERTAS_EMAIL_TO o hola@sevencars.es.
 */
import { sendMail } from '@/lib/mailer'

export const ALERTAS_EMAIL_DEFAULT = 'hola@sevencars.es'

export function destinatarioAlertas(): string {
  return process.env.ALERTAS_EMAIL_TO?.trim() || ALERTAS_EMAIL_DEFAULT
}

export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

export async function notificarFalloCron(
  nombre: string,
  detalle: unknown
): Promise<void> {
  try {
    const texto =
      typeof detalle === 'string'
        ? detalle
        : (JSON.stringify(detalle, null, 2) ?? String(detalle))
    const ts = new Date().toISOString()
    const r = await sendMail({
      to: destinatarioAlertas(),
      subject: `[CRM] Fallo del cron ${nombre}`,
      html: `<p>El cron <strong>${escapeHtml(nombre)}</strong> ha reportado un fallo (${ts}).</p><pre style="font:12px/1.4 monospace;white-space:pre-wrap">${escapeHtml(texto)}</pre>`,
      text: `El cron ${nombre} ha reportado un fallo (${ts}).\n\n${texto}`,
    })
    if (!r.sent)
      console.warn(
        `[cronNotify] aviso de fallo de ${nombre} no enviado:`,
        r.reason
      )
  } catch (err) {
    console.error(`[cronNotify] error avisando fallo de ${nombre}:`, err)
  }
}

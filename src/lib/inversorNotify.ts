/**
 * Aviso automático al inversor cuando un coche suyo se reserva o se vende.
 *
 * Se dispara desde los dos caminos que cambian el estado del vehículo:
 * updateDeal (flujo de deals) y PUT /api/vehiculos/[id] (edición manual).
 * Dedup por (vehiculo_id, evento) en `inversor_notificaciones`: un solo mail
 * por coche y evento aunque el estado se toque varias veces o por dos vías.
 *
 * Best-effort: nunca lanza; si falta la tabla, el email del inversor o
 * SMTP_PASS, se salta en silencio (queda el motivo en el retorno para logs).
 * Kill-switch: INVERSOR_MAIL_DISABLED=1.
 */
import { pool } from '@/lib/direct-database'
import { sendMail } from '@/lib/mailer'

export type EventoInversor = 'reservado' | 'vendido'

export interface DatosEmail {
  inversorNombre: string
  marca: string
  modelo: string
  matricula: string | null
  referencia: string
  evento: EventoInversor
  fecha: string // dd/mm/yyyy
}

/** Arma asunto + cuerpos del email. Pura, para poder testearla. */
export function buildInversorEmail(d: DatosEmail): {
  subject: string
  html: string
  text: string
} {
  const coche = [d.marca, d.modelo].filter(Boolean).join(' ')
  const accion = d.evento === 'vendido' ? 'se ha vendido' : 'se ha reservado'
  const subject = `SevenCars — tu ${coche} ${accion}`
  const detalle = [
    ['Vehículo', coche],
    ['Matrícula', d.matricula || '—'],
    ['Referencia', d.referencia],
    ['Fecha', d.fecha],
    ['Estado', d.evento === 'vendido' ? 'Vendido' : 'Reservado'],
  ]
  const filas = detalle
    .map(
      ([k, v]) =>
        `<tr><td style="padding:4px 12px 4px 0;color:#64748b">${k}</td><td style="padding:4px 0;font-weight:600">${v}</td></tr>`
    )
    .join('')
  const html = `
<div style="font-family:Arial,Helvetica,sans-serif;color:#1e293b;max-width:560px">
  <p>Hola ${d.inversorNombre},</p>
  <p>Te informamos que tu vehículo <strong>${coche}</strong> ${accion}.</p>
  <table style="border-collapse:collapse;margin:12px 0">${filas}</table>
  ${
    d.evento === 'vendido'
      ? '<p>El detalle de la operación y tu beneficio estarán disponibles en tu panel de inversor.</p>'
      : '<p>Te avisaremos cuando la venta se complete.</p>'
  }
  <p>Un saludo,<br/>SevenCars</p>
  <p style="color:#94a3b8;font-size:12px">Este es un aviso automático del sistema de gestión de SevenCars.</p>
</div>`
  const text =
    `Hola ${d.inversorNombre},\n\n` +
    `Tu vehículo ${coche} ${accion}.\n\n` +
    detalle.map(([k, v]) => `${k}: ${v}`).join('\n') +
    `\n\nUn saludo,\nSevenCars`
  return { subject, html, text }
}

export async function notifyInversorVehiculoEvento(
  vehiculoId: number,
  evento: EventoInversor
): Promise<{ sent: boolean; reason?: string }> {
  try {
    if (process.env.INVERSOR_MAIL_DISABLED === '1') {
      return { sent: false, reason: 'INVERSOR_MAIL_DISABLED' }
    }
    const res = await pool.query(
      `SELECT v.marca, v.modelo, v.matricula, v.referencia, v."inversorId",
              i.nombre AS inversor_nombre, i.email AS inversor_email
         FROM "Vehiculo" v
         LEFT JOIN "Inversor" i ON i.id = v."inversorId"
        WHERE v.id = $1`,
      [vehiculoId]
    )
    const v = res.rows[0]
    if (!v?.inversorId) return { sent: false, reason: 'sin inversor' }
    if (!v.inversor_email) return { sent: false, reason: 'inversor sin email' }

    // Claim del slot (dedup). Si ya existe, el mail ya se mandó.
    let claimId: number | null = null
    try {
      const claim = await pool.query(
        `INSERT INTO inversor_notificaciones (vehiculo_id, inversor_id, evento, email)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (vehiculo_id, evento) DO NOTHING
         RETURNING id`,
        [vehiculoId, v.inversorId, evento, v.inversor_email]
      )
      if (claim.rows.length === 0) return { sent: false, reason: 'ya notificado' }
      claimId = claim.rows[0].id
    } catch (err) {
      // Tabla aún no migrada: no bloquear el flujo principal.
      return { sent: false, reason: `sin tabla dedup: ${(err as Error)?.message}` }
    }

    const fecha = new Date().toLocaleDateString('es-ES', {
      timeZone: 'Europe/Madrid',
    })
    const mail = buildInversorEmail({
      inversorNombre: v.inversor_nombre || 'inversor',
      marca: v.marca || '',
      modelo: v.modelo || '',
      matricula: v.matricula,
      referencia: v.referencia,
      evento,
      fecha,
    })
    const r = await sendMail({ to: v.inversor_email, ...mail })
    if (!r.sent && claimId != null) {
      // liberar el slot para reintentar en el próximo cambio de estado
      await pool
        .query(`DELETE FROM inversor_notificaciones WHERE id = $1`, [claimId])
        .catch(() => {})
    }
    return r
  } catch (err) {
    console.error('[inversorNotify] error:', (err as Error)?.message ?? err)
    return { sent: false, reason: (err as Error)?.message ?? String(err) }
  }
}

/**
 * URLs y nombres de archivo del presupuesto. Puro (sin DB).
 */
import { INVOICE_CONFIG } from '@/config/invoiceConfig'
import { matriculaCanonica, segmento } from '@/lib/nombreCanonico'
import { normalizarTelefono } from '@/lib/plantillasMensajes'

const APP_URL_DEFAULT = 'https://sevencars.vercel.app'
const EXT_IMAGEN = /\.(jpe?g|png|webp|gif|svg|avif)$/i

export function baseUrlApp(): string {
  return (process.env.NEXT_PUBLIC_APP_URL || APP_URL_DEFAULT).replace(
    /\/+$/,
    ''
  )
}

export function urlPublicaPresupuesto(token: string): string {
  return `${baseUrlApp()}/p/${token}`
}

/**
 * URL del botón Reservar: la url_qr de la ficha si es una página de
 * sevencars.es (no una imagen); si no, la URL por defecto.
 */
export function urlReserva(
  urlQr: string | null | undefined,
  porDefecto: string
): string {
  if (!urlQr) return porDefecto
  try {
    const u = new URL(urlQr)
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return porDefecto
    const host = u.hostname.toLowerCase()
    if (host !== 'sevencars.es' && !host.endsWith('.sevencars.es')) {
      return porDefecto
    }
    if (EXT_IMAGEN.test(u.pathname)) return porDefecto
    return urlQr
  } catch {
    return porDefecto
  }
}

/**
 * Env pública > parámetro > teléfono de la empresa de las facturas; normalizado
 * E.164 sin '+'. Solo devuelve null si ninguno es un teléfono válido.
 */
export function telefonoWhatsAppEmpresa(
  param: string | null | undefined
): string | null {
  return (
    normalizarTelefono(process.env.NEXT_PUBLIC_WHATSAPP_EMPRESA) ??
    normalizarTelefono(param) ??
    normalizarTelefono(INVOICE_CONFIG.vendor.phone)
  )
}

export function nombrePdfPresupuesto(
  numero: string,
  coche: {
    nombre_comercial?: string | null
    marca?: string | null
    modelo?: string | null
    matricula?: string | null
  }
): string {
  const nombre =
    segmento(coche.nombre_comercial) ||
    [segmento(coche.marca), segmento(coche.modelo)].filter(Boolean).join('-')
  const partes = [
    'Presupuesto',
    numero,
    nombre,
    matriculaCanonica(coche.matricula),
  ]
  return `${partes.filter(Boolean).join('-')}.pdf`
}

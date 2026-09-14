/**
 * Códigos QR (server-only: `qrcode` usa pngjs, sin canvas). No importar desde
 * módulos 'use client'.
 */
import { toDataURL, toString as qrToString } from 'qrcode'

/** PNG como data URL; `px` ≥ 300 para que quede nítido a 30–40 mm en PDF. */
export function qrPngDataUrl(url: string, px = 300): Promise<string> {
  return toDataURL(url, { margin: 1, width: px, errorCorrectionLevel: 'M' })
}

export function qrSvg(url: string, px = 160): Promise<string> {
  return qrToString(url, { type: 'svg', margin: 1, width: px })
}

/**
 * Helper para descargar PDFs desde una URL controlando el filename
 * y el feedback al usuario (toast + loading). Inspirado en el patrón
 * de Wheel Lab CRM: fetch → blob → createObjectURL → anchor click.
 *
 * El uso de `a.download = filename` garantiza que el archivo guardado
 * tenga el nombre que querés (ej. "factura-F-2026-4235.pdf") incluso
 * si la URL del blob no lo trae así.
 */

export interface DownloadPdfOptions {
  /** URL del endpoint o del PDF directo (puede redirigir). */
  url: string
  /** Nombre con el que se guarda el archivo. NO incluye extensión .pdf. */
  filename: string
  /** Callback ejecutado al inicio (para setear loading). */
  onStart?: () => void
  /** Callback ejecutado siempre al final (loading off, etc.). */
  onFinish?: () => void
  /** Callback de error con mensaje legible. */
  onError?: (message: string) => void
}

export async function downloadPdf(opts: DownloadPdfOptions): Promise<void> {
  const { url, filename, onStart, onFinish, onError } = opts
  try {
    onStart?.()
    const res = await fetch(url, { redirect: 'follow' })
    if (!res.ok) {
      const body = await res.json().catch(() => null)
      throw new Error(
        body?.error ?? `Error descargando PDF (HTTP ${res.status})`
      )
    }
    const blob = await res.blob()
    const objectUrl = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = objectUrl
    a.download = filename.endsWith('.pdf') ? filename : `${filename}.pdf`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    // Damos margen al browser antes de revocar (evita Save dialog vacío).
    setTimeout(() => URL.revokeObjectURL(objectUrl), 500)
  } catch (err) {
    console.error('[downloadPdf]', err)
    onError?.(err instanceof Error ? err.message : 'Error descargando PDF')
  } finally {
    onFinish?.()
  }
}

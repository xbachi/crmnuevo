/**
 * Adapter de firma digital detrás de env flag.
 *
 * Proveedor actual: Signaturit (API REST v3). Se activa seteando
 * SIGNATURIT_API_KEY; sin la key, getProveedorFirma() devuelve null y los
 * endpoints responden 501 (feature apagada, cero impacto).
 */

export interface Firmante {
  nombre: string
  email: string
}

export interface CrearSolicitudParams {
  pdfBase64: string
  nombreArchivo: string
  firmantes: Firmante[]
  metadata?: Record<string, string>
}

export interface SolicitudFirma {
  solicitudId: string
  url?: string
}

export interface ProveedorFirma {
  readonly nombre: string
  crearSolicitud(params: CrearSolicitudParams): Promise<SolicitudFirma>
}

const SIGNATURIT_BASE = 'https://api.signaturit.com/v3'

export class SignaturitProvider implements ProveedorFirma {
  readonly nombre = 'signaturit'

  constructor(private apiKey: string) {}

  async crearSolicitud(params: CrearSolicitudParams): Promise<SolicitudFirma> {
    const form = new FormData()
    const bytes = Buffer.from(params.pdfBase64, 'base64')
    form.append(
      'files[0]',
      new Blob([new Uint8Array(bytes)], { type: 'application/pdf' }),
      params.nombreArchivo
    )
    params.firmantes.forEach((f, i) => {
      form.append(`recipients[${i}][name]`, f.nombre)
      form.append(`recipients[${i}][email]`, f.email)
    })
    form.append('delivery_type', 'email')
    for (const [k, v] of Object.entries(params.metadata ?? {})) {
      form.append(`data[${k}]`, v)
    }

    const res = await fetch(`${SIGNATURIT_BASE}/signatures.json`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${this.apiKey}` },
      body: form,
    })
    if (!res.ok) {
      const detail = await res.text().catch(() => '')
      throw new Error(`Signaturit ${res.status}: ${detail.slice(0, 500)}`)
    }
    const json = (await res.json()) as { id?: string; url?: string }
    if (!json.id) {
      throw new Error('Signaturit: respuesta sin id de solicitud')
    }
    return { solicitudId: json.id, url: json.url }
  }
}

/** null si la firma digital no está configurada (sin SIGNATURIT_API_KEY). */
export function getProveedorFirma(): ProveedorFirma | null {
  const key = process.env.SIGNATURIT_API_KEY
  if (!key) return null
  return new SignaturitProvider(key)
}

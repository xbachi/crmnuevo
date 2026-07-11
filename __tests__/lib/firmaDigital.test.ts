/**
 * @jest-environment node
 *
 * SignaturitProvider — arma la request multipart correcta contra la API v3
 * (fetch mockeado) y getProveedorFirma respeta el env flag.
 */
import { SignaturitProvider, getProveedorFirma } from '@/lib/firmaDigital'

describe('getProveedorFirma (env flag)', () => {
  const OLD_KEY = process.env.SIGNATURIT_API_KEY

  afterEach(() => {
    if (OLD_KEY === undefined) delete process.env.SIGNATURIT_API_KEY
    else process.env.SIGNATURIT_API_KEY = OLD_KEY
  })

  it('sin SIGNATURIT_API_KEY → null', () => {
    delete process.env.SIGNATURIT_API_KEY
    expect(getProveedorFirma()).toBeNull()
  })

  it('con SIGNATURIT_API_KEY → SignaturitProvider', () => {
    process.env.SIGNATURIT_API_KEY = 'k'
    const p = getProveedorFirma()
    expect(p).toBeInstanceOf(SignaturitProvider)
    expect(p?.nombre).toBe('signaturit')
  })
})

describe('SignaturitProvider.crearSolicitud', () => {
  afterEach(() => jest.restoreAllMocks())

  const PARAMS = {
    pdfBase64: Buffer.from('%PDF-fake').toString('base64'),
    nombreArchivo: 'contrato-venta-D-0009.pdf',
    firmantes: [{ nombre: 'Ana Pérez', email: 'ana@test.com' }],
    metadata: { dealId: '9' },
  }

  it('POSTea multipart a /v3/signatures.json con Bearer, archivo, firmantes y metadata', async () => {
    const fetchMock = jest
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(
        new Response(JSON.stringify({ id: 'sig-123', url: 'https://sign/x' }), { status: 200 })
      )

    const provider = new SignaturitProvider('api-key-1')
    const out = await provider.crearSolicitud(PARAMS)

    expect(out).toEqual({ solicitudId: 'sig-123', url: 'https://sign/x' })
    expect(fetchMock).toHaveBeenCalledTimes(1)

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('https://api.signaturit.com/v3/signatures.json')
    expect(init.method).toBe('POST')
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer api-key-1')

    const form = init.body as FormData
    expect(form).toBeInstanceOf(FormData)
    expect(form.get('recipients[0][name]')).toBe('Ana Pérez')
    expect(form.get('recipients[0][email]')).toBe('ana@test.com')
    expect(form.get('delivery_type')).toBe('email')
    expect(form.get('data[dealId]')).toBe('9')
    const file = form.get('files[0]') as File
    expect(file).toBeTruthy()
    expect(file.name).toBe('contrato-venta-D-0009.pdf')
    expect(file.type).toBe('application/pdf')
    expect(Buffer.from(await file.arrayBuffer()).toString()).toBe('%PDF-fake')
  })

  it('error HTTP del proveedor → lanza con status y detalle', async () => {
    jest
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response('bad key', { status: 401 }))
    const provider = new SignaturitProvider('bad')
    await expect(provider.crearSolicitud(PARAMS)).rejects.toThrow('Signaturit 401')
  })
})

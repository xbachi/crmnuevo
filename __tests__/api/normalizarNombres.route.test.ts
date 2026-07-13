/**
 * @jest-environment node
 *
 * POST /api/expedientes/normalizar-nombres — dryRun por defecto (no escribe),
 * sólo renombra lo identificado con certeza (hash o nombre inequívoco), nunca
 * lo ambiguo ni lo que está en conflicto, y borra los duplicados exactos.
 */

jest.mock('@/lib/direct-database', () => ({
  pool: { query: jest.fn() },
}))
jest.mock('@/lib/auth-server', () => ({
  readSessionFromRequest: jest.fn(() => null),
}))

import { NextRequest } from 'next/server'
import { pool } from '@/lib/direct-database'
import { readSessionFromRequest } from '@/lib/auth-server'
import { POST } from '@/app/api/expedientes/normalizar-nombres/route'

const mockQuery = pool.query as jest.Mock
const mockSession = readSessionFromRequest as jest.Mock

function makeRequest(body: Record<string, unknown>) {
  return new NextRequest('http://localhost/api/expedientes/normalizar-nombres', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

const SNAPSHOT_ROWS = [
  {
    mes: '04-Abril',
    carpeta: '74-Opel-Astra-8061KRN',
    matricula_norm: '8061KRN',
    archivos: [
      // identificada por HASH contra facturas_registro (el nombre no dice nada)
      { nombre: 'FRA.pdf', hash: 'h-compra' },
      // el mismo PDF de compra guardado dos veces → sobra uno
      { nombre: 'copia-FRA.pdf', hash: 'h-compra' },
      // identificada por NOMBRE inequívoco
      { nombre: 'factura-venta (1).pdf', hash: 'h-venta' },
      // ambiguo: ¿compra o venta? → NO se toca
      { nombre: 'factura.pdf', hash: 'h-ambiguo' },
      // fuera de la checklist → NO se toca
      { nombre: 'Permiso circulacion.pdf', hash: 'h-permiso' },
    ],
  },
  {
    // mismo contenido con nombre de dos documentos distintos: uno de los dos no
    // existe. Renombrar consolidaría el error → NO se toca ninguno.
    mes: '05-Mayo',
    carpeta: '80-Kia-Xceed-0608NLF',
    matricula_norm: '0608NLF',
    archivos: [
      { nombre: 'Contrato compra.pdf', hash: 'h-mismo' },
      { nombre: 'Contrato comprador.pdf', hash: 'h-mismo' },
    ],
  },
]

const REGISTROS = [
  { hash_contenido: 'h-compra', categoria: 'coche-compra', matricula: '8061KRN' },
]

const INVOICES = [
  { vehicle_plate: '8061KRN', vehicle_make: 'Opel', vehicle_model: 'Astra' },
  { vehicle_plate: '0608NLF', vehicle_make: 'Kia', vehicle_model: 'Xceed' },
]

/** regclass carpetas → snapshot → regclass facturas_registro → registros → invoices */
function mockLecturas() {
  mockQuery
    .mockResolvedValueOnce({ rows: [{ reg: 'expedientes_carpetas' }] })
    .mockResolvedValueOnce({ rows: SNAPSHOT_ROWS })
    .mockResolvedValueOnce({ rows: [{ reg: 'facturas_registro' }] })
    .mockResolvedValueOnce({ rows: REGISTROS })
    .mockResolvedValueOnce({ rows: INVOICES })
}

beforeEach(() => {
  jest.clearAllMocks()
  mockSession.mockReturnValue({ uid: 1, user: 'seb', role: 'admin' })
})

describe('auth y validación', () => {
  it('401 sin sesión', async () => {
    mockSession.mockReturnValue(null)
    const res = await POST(makeRequest({ year: 2026, quarter: 2 }))
    expect(res.status).toBe(401)
    expect(mockQuery).not.toHaveBeenCalled()
  })

  it('403 con sesión no admin', async () => {
    mockSession.mockReturnValue({ uid: 2, user: 'ana', role: 'asesor' })
    const res = await POST(makeRequest({ year: 2026, quarter: 2 }))
    expect(res.status).toBe(403)
  })

  it('400 con quarter inválido', async () => {
    const res = await POST(makeRequest({ year: 2026, quarter: 7 }))
    expect(res.status).toBe(400)
  })

  it('409 sin snapshot de OneDrive', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [{ reg: 'expedientes_carpetas' }] })
      .mockResolvedValueOnce({ rows: [] })
    const res = await POST(makeRequest({ year: 2026, quarter: 2 }))
    expect(res.status).toBe(409)
    expect(global.fetch).not.toHaveBeenCalled()
  })
})

describe('dryRun (por defecto)', () => {
  it('no escribe nada y propone sólo lo identificado con certeza', async () => {
    mockLecturas()

    const res = await POST(makeRequest({ year: 2026, quarter: 2 })) // sin dryRun → true
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.dryRun).toBe(true)
    // Ni webhook, ni INSERT: sólo las 5 lecturas.
    expect(global.fetch).not.toHaveBeenCalled()
    expect(mockQuery).toHaveBeenCalledTimes(5)
    expect(
      mockQuery.mock.calls.some((c: unknown[]) => /INSERT INTO/i.test(String(c[0])))
    ).toBe(false)

    expect(body.renombrados).toEqual([
      {
        carpeta: '74-Opel-Astra-8061KRN',
        de: 'FRA.pdf',
        a: 'Factura-Compra-Opel-Astra-8061KRN.pdf',
      },
      {
        carpeta: '74-Opel-Astra-8061KRN',
        de: 'factura-venta (1).pdf',
        a: 'Factura-Venta-Opel-Astra-8061KRN.pdf',
      },
    ])

    // Mismo contenido dos veces → se borra la copia, no se inventa un -pag2.
    expect(body.duplicados).toEqual([
      {
        carpeta: '74-Opel-Astra-8061KRN',
        nombre: 'copia-FRA.pdf',
        duplicadoDe: 'FRA.pdf',
      },
    ])
  })

  it('el ambiguo y el irrelevante quedan omitidos con su motivo', async () => {
    mockLecturas()
    const body = await (await POST(makeRequest({ year: 2026, quarter: 2 }))).json()

    const ambiguo = body.omitidos.find((o: { nombre: string }) => o.nombre === 'factura.pdf')
    expect(ambiguo).toMatchObject({ carpeta: '74-Opel-Astra-8061KRN' })
    expect(ambiguo.motivo).toMatch(/no se pudo clasificar/)

    const irrelevante = body.omitidos.find(
      (o: { nombre: string }) => o.nombre === 'Permiso circulacion.pdf'
    )
    expect(irrelevante.motivo).toMatch(/no es de la checklist/)

    // Ninguno de los dos aparece en el plan de renombrado.
    const renombrados = body.renombrados.map((r: { de: string }) => r.de)
    expect(renombrados).not.toContain('factura.pdf')
    expect(renombrados).not.toContain('Permiso circulacion.pdf')
  })

  it('mismo archivo con dos nombres (conflicto): no se toca ninguno', async () => {
    mockLecturas()
    const body = await (await POST(makeRequest({ year: 2026, quarter: 2 }))).json()

    const enConflicto = body.omitidos.filter(
      (o: { carpeta: string }) => o.carpeta === '80-Kia-Xceed-0608NLF'
    )
    expect(enConflicto).toHaveLength(2)
    for (const o of enConflicto) expect(o.motivo).toMatch(/mismo contenido que otro archivo/)
    expect(
      body.renombrados.some((r: { carpeta: string }) => r.carpeta === '80-Kia-Xceed-0608NLF')
    ).toBe(false)
  })
})

describe('dryRun:false', () => {
  it('409 si falta la tabla de traza (sin registro no se renombra)', async () => {
    mockLecturas()
    mockQuery.mockResolvedValueOnce({ rows: [{ reg: null }] })

    const res = await POST(makeRequest({ year: 2026, quarter: 2, dryRun: false }))
    expect(res.status).toBe(409)
    expect((await res.json()).nota).toMatch(/expedientes_renombres/)
    expect(global.fetch).not.toHaveBeenCalled()
  })

  it('manda el plan al server, guarda la traza y reporta los conflictos como fallidos', async () => {
    mockLecturas()
    mockQuery
      .mockResolvedValueOnce({ rows: [{ reg: 'expedientes_renombres' }] })
      .mockResolvedValue({ rows: [] }) // los INSERT de traza
    ;(global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({
        ok: false,
        resultados: [
          {
            carpeta: '74-Opel-Astra-8061KRN',
            nombre: 'copia-FRA.pdf',
            destino: null,
            accion: 'borrado',
            ok: true,
            motivo: 'duplicado exacto de FRA.pdf',
          },
          {
            carpeta: '74-Opel-Astra-8061KRN',
            nombre: 'FRA.pdf',
            destino: 'Factura-Compra-Opel-Astra-8061KRN.pdf',
            accion: 'renombrado',
            ok: true,
          },
          {
            // el destino ya existía con OTRO contenido → el server no lo pisa
            carpeta: '74-Opel-Astra-8061KRN',
            nombre: 'factura-venta (1).pdf',
            destino: 'Factura-Venta-Opel-Astra-8061KRN.pdf',
            accion: 'omitido',
            ok: false,
            motivo: 'ya existe Factura-Venta-Opel-Astra-8061KRN.pdf con OTRO contenido — conflicto',
          },
        ],
      }),
    })

    process.env.N8N_RENAME_WEBHOOK_URL = 'https://n8n.example.com/webhook/rename'
    const res = await POST(makeRequest({ year: 2026, quarter: 2, dryRun: false }))
    delete process.env.N8N_RENAME_WEBHOOK_URL

    const body = await res.json()
    expect(res.status).toBe(200)
    expect(body.dryRun).toBe(false)

    // El payload al server lleva el hash esperado de cada archivo.
    const [url, init] = (global.fetch as jest.Mock).mock.calls[0]
    expect(url).toBe('https://n8n.example.com/webhook/rename')
    const payload = JSON.parse((init as { body: string }).body)
    expect(payload.renombrar).toContainEqual({
      mes: '04-Abril',
      carpeta: '74-Opel-Astra-8061KRN',
      de: 'FRA.pdf',
      a: 'Factura-Compra-Opel-Astra-8061KRN.pdf',
      hash: 'h-compra',
    })
    expect(payload.borrar).toEqual([
      {
        mes: '04-Abril',
        carpeta: '74-Opel-Astra-8061KRN',
        nombre: 'copia-FRA.pdf',
        hash: 'h-compra',
        duplicadoDe: 'FRA.pdf',
      },
    ])

    // Resultado: 1 renombrado, 1 duplicado borrado, 1 conflicto → fallido.
    expect(body.renombrados).toEqual([
      {
        carpeta: '74-Opel-Astra-8061KRN',
        de: 'FRA.pdf',
        a: 'Factura-Compra-Opel-Astra-8061KRN.pdf',
      },
    ])
    expect(body.duplicados).toEqual([
      { carpeta: '74-Opel-Astra-8061KRN', nombre: 'copia-FRA.pdf', duplicadoDe: 'FRA.pdf' },
    ])
    expect(body.fallidos).toHaveLength(1)
    expect(body.fallidos[0].motivo).toMatch(/OTRO contenido/)
    expect(body.ok).toBe(false)

    // Traza: una fila por operación aplicada (2), ninguna por la omitida.
    const inserts = mockQuery.mock.calls.filter((c: unknown[]) =>
      /INSERT INTO expedientes_renombres/.test(String(c[0]))
    )
    expect(inserts).toHaveLength(2)
    expect(inserts[0][1]).toEqual(
      expect.arrayContaining([2026, 2, '04-Abril', '74-Opel-Astra-8061KRN', 'copia-FRA.pdf'])
    )
  })
})

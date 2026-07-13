/**
 * @jest-environment node
 *
 * POST /api/expedientes/normalizar-nombres — dryRun por defecto (no escribe),
 * sólo renombra lo identificado con certeza (hash o nombre inequívoco), nunca
 * lo ambiguo ni lo que está en conflicto, y borra los duplicados exactos.
 *
 * Incidente 2T 2026 (renombrado ejecutado + 502 = archivos sin traza): la
 * intención se escribe ANTES de tocar OneDrive, el trabajo va en lotes y la
 * corrida es reanudable e idempotente.
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

const CANONICO_COMPRA = 'Factura-Compra-Opel-Astra-8061KRN.pdf'
const CANONICO_VENTA = 'Factura-Venta-Opel-Astra-8061KRN.pdf'

/**
 * regclass carpetas → snapshot → regclass facturas_registro → registros →
 * invoices → meta de la traza → filas de la traza.
 */
function mockLecturas(
  opts: {
    trazaExiste?: boolean
    tieneEstado?: boolean
    traza?: Record<string, unknown>[]
    snapshot?: unknown[]
  } = {}
) {
  const { trazaExiste = true, tieneEstado = true, traza = [], snapshot = SNAPSHOT_ROWS } = opts
  mockQuery
    // to_regclass vehiculo_matriculas (historial de matrículas): sin tabla → sin alias
    .mockResolvedValueOnce({ rows: [{ reg: null }] })
    .mockResolvedValueOnce({ rows: [{ reg: 'expedientes_carpetas' }] })
    .mockResolvedValueOnce({ rows: snapshot })
    .mockResolvedValueOnce({ rows: [{ reg: 'facturas_registro' }] })
    .mockResolvedValueOnce({ rows: REGISTROS })
    .mockResolvedValueOnce({ rows: INVOICES })
    .mockResolvedValueOnce({
      rows: [{ reg: trazaExiste ? 'expedientes_renombres' : null, tiene_estado: tieneEstado }],
    })
  if (trazaExiste) mockQuery.mockResolvedValueOnce({ rows: traza })
}

/** INSERT de intención → devuelve un id por fila insertada. */
function mockIntencion(startId = 1) {
  mockQuery.mockImplementationOnce((sql: string, params: unknown[]) => {
    expect(String(sql)).toMatch(/INSERT INTO expedientes_renombres/)
    const rows: { id: number; carpeta: string; nombre_original: string }[] = []
    for (let i = 0; i * 9 < params.length; i++) {
      rows.push({
        id: startId + i,
        carpeta: String(params[i * 9 + 3]),
        nombre_original: String(params[i * 9 + 4]),
      })
    }
    return Promise.resolve({ rows })
  })
}

const inserts = () =>
  mockQuery.mock.calls.filter((c: unknown[]) =>
    /INSERT INTO expedientes_renombres/.test(String(c[0]))
  )
const updates = () =>
  mockQuery.mock.calls.filter((c: unknown[]) =>
    /UPDATE expedientes_renombres/.test(String(c[0]))
  )

beforeEach(() => {
  jest.clearAllMocks()
  mockSession.mockReturnValue({ uid: 1, user: 'seb', role: 'admin' })
  process.env.N8N_RENAME_WEBHOOK_URL = 'https://n8n.example.com/webhook/rename'
  // Tablas opcionales fuera de la secuencia (vehiculo_matriculas): sin fila.
  mockQuery.mockResolvedValue({ rows: [] })
})

afterEach(() => {
  delete process.env.N8N_RENAME_WEBHOOK_URL
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
    // Ni webhook, ni INSERT: sólo lecturas.
    expect(global.fetch).not.toHaveBeenCalled()
    expect(inserts()).toHaveLength(0)
    expect(updates()).toHaveLength(0)

    expect(body.renombrados).toEqual([
      { carpeta: '74-Opel-Astra-8061KRN', de: 'FRA.pdf', a: CANONICO_COMPRA },
      { carpeta: '74-Opel-Astra-8061KRN', de: 'factura-venta (1).pdf', a: CANONICO_VENTA },
    ])

    // Mismo contenido dos veces → se borra la copia, no se inventa un -pag2.
    expect(body.duplicados).toEqual([
      { carpeta: '74-Opel-Astra-8061KRN', nombre: 'copia-FRA.pdf', duplicadoDe: 'FRA.pdf' },
    ])
    expect(body.total).toBe(3)
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
    mockLecturas({ trazaExiste: false })

    const res = await POST(makeRequest({ year: 2026, quarter: 2, dryRun: false }))
    expect(res.status).toBe(409)
    expect((await res.json()).nota).toMatch(/expedientes_renombres/)
    expect(global.fetch).not.toHaveBeenCalled()
  })

  it('409 si falta la columna estado (no se puede registrar la intención antes)', async () => {
    mockLecturas({ tieneEstado: false })

    const res = await POST(makeRequest({ year: 2026, quarter: 2, dryRun: false }))
    expect(res.status).toBe(409)
    expect((await res.json()).nota).toMatch(/add-expedientes-renombres-estado\.sql/)
    expect(global.fetch).not.toHaveBeenCalled()
  })

  it('manda el plan al server, guarda la traza y reporta los conflictos como fallidos', async () => {
    mockLecturas()
    mockIntencion()
    mockQuery.mockResolvedValue({ rows: [] }) // los UPDATE de confirmación
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
            destino: CANONICO_COMPRA,
            accion: 'renombrado',
            ok: true,
          },
          {
            // el destino ya existía con OTRO contenido → el server no lo pisa
            carpeta: '74-Opel-Astra-8061KRN',
            nombre: 'factura-venta (1).pdf',
            destino: CANONICO_VENTA,
            accion: 'omitido',
            ok: false,
            motivo: `ya existe ${CANONICO_VENTA} con OTRO contenido — conflicto`,
          },
        ],
      }),
    })

    const res = await POST(makeRequest({ year: 2026, quarter: 2, dryRun: false }))
    const body = await res.json()
    expect(res.status).toBe(200)
    expect(body.dryRun).toBe(false)
    expect(body.completado).toBe(true)

    // El payload al server lleva el hash esperado de cada archivo.
    const [url, init] = (global.fetch as jest.Mock).mock.calls[0]
    expect(url).toBe('https://n8n.example.com/webhook/rename')
    const payload = JSON.parse((init as { body: string }).body)
    expect(payload.renombrar).toContainEqual({
      mes: '04-Abril',
      carpeta: '74-Opel-Astra-8061KRN',
      de: 'FRA.pdf',
      a: CANONICO_COMPRA,
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
      { carpeta: '74-Opel-Astra-8061KRN', de: 'FRA.pdf', a: CANONICO_COMPRA },
    ])
    expect(body.duplicados).toEqual([
      { carpeta: '74-Opel-Astra-8061KRN', nombre: 'copia-FRA.pdf', duplicadoDe: 'FRA.pdf' },
    ])
    expect(body.fallidos).toHaveLength(1)
    expect(body.fallidos[0].motivo).toMatch(/OTRO contenido/)
    expect(body.ok).toBe(false)
  })
})

describe('traza: intención ANTES de tocar OneDrive (incidente 2T 2026)', () => {
  it('registra las 3 operaciones como pendiente antes de llamar al webhook', async () => {
    const orden: string[] = []
    mockLecturas()
    mockQuery.mockImplementation(((sql: string, params: unknown[]) => {
      if (/INSERT INTO expedientes_renombres/.test(String(sql))) {
        orden.push('insert')
        const rows: { id: number; carpeta: string; nombre_original: string }[] = []
        for (let i = 0; i * 9 < (params?.length ?? 0); i++) {
          rows.push({
            id: i + 1,
            carpeta: String(params[i * 9 + 3]),
            nombre_original: String(params[i * 9 + 4]),
          })
        }
        return Promise.resolve({ rows })
      }
      return Promise.resolve({ rows: [] })
    }) as never)
    ;(global.fetch as jest.Mock).mockImplementationOnce(async () => {
      orden.push('webhook')
      return {
        ok: true,
        status: 200,
        json: async () => ({ ok: true, resultados: [] }),
      }
    })

    await POST(makeRequest({ year: 2026, quarter: 2, dryRun: false }))

    // La intención se escribe PRIMERO: si la función muere ahora, queda el rastro.
    expect(orden).toEqual(['insert', 'webhook'])
    const fila = inserts()[0]
    expect(String(fila[0])).toMatch(/'pendiente'\)/)
    const params = fila[1] as unknown[]
    expect(params.slice(0, 9)).toEqual([
      2026,
      2,
      '04-Abril',
      '74-Opel-Astra-8061KRN',
      'copia-FRA.pdf',
      null, // borrado: sin nombre nuevo
      'h-compra',
      'borrado',
      '1',
    ])
  })

  it('el webhook nunca responde → la intención queda pendiente (no se confirma nada)', async () => {
    mockLecturas()
    mockIntencion()
    mockQuery.mockResolvedValue({ rows: [] })
    ;(global.fetch as jest.Mock).mockRejectedValueOnce(new Error('The operation was aborted'))

    const res = await POST(makeRequest({ year: 2026, quarter: 2, dryRun: false }))
    const body = await res.json()

    // Se pidieron las 3 operaciones y quedaron registradas como pendientes.
    expect(inserts()).toHaveLength(1)
    expect((inserts()[0][1] as unknown[]).length).toBe(27) // 3 ops × 9 columnas
    // Nada confirmado: no se sabe si el server llegó a renombrar. Marcarlo como
    // fallido sería mentir; el rastro queda para revertir a mano.
    expect(updates()).toHaveLength(0)

    expect(body.ok).toBe(false)
    expect(body.completado).toBe(false)
    expect(body.restantes).toBe(3)
    expect(body.error).toMatch(/aborted/)
    expect(body.renombrados).toEqual([])
  })

  it('un fallo explícito del server marca fallido, no aplicado', async () => {
    mockLecturas()
    mockIntencion()
    mockQuery.mockResolvedValue({ rows: [] })
    ;(global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({
        ok: false,
        resultados: [
          {
            carpeta: '74-Opel-Astra-8061KRN',
            nombre: 'copia-FRA.pdf',
            accion: 'omitido',
            ok: false,
            motivo: 'el archivo cambió desde el último escaneo (md5 distinto)',
          },
          {
            carpeta: '74-Opel-Astra-8061KRN',
            nombre: 'FRA.pdf',
            destino: CANONICO_COMPRA,
            accion: 'renombrado',
            ok: true,
          },
        ],
      }),
    })

    const body = await (
      await POST(makeRequest({ year: 2026, quarter: 2, dryRun: false }))
    ).json()

    const estados = updates().map((c) => (c[1] as unknown[])[1])
    expect(estados).toContain('fallido')
    expect(estados).toContain('aplicado')
    // Sólo lo que el server confirmó sale como aplicado.
    expect(estados.filter((e) => e === 'aplicado')).toHaveLength(1)
    expect(body.renombrados).toEqual([
      { carpeta: '74-Opel-Astra-8061KRN', de: 'FRA.pdf', a: CANONICO_COMPRA },
    ])
    // La operación que el server no reportó (factura-venta) sigue pendiente.
    expect(body.restantes).toBe(1)
    expect(body.completado).toBe(false)
  })
})

describe('lotes y reanudación', () => {
  /** 12 carpetas con una factura de compra cada una → 12 ops, > OPS_POR_LOTE. */
  const SNAPSHOT_GRANDE = Array.from({ length: 12 }, (_, i) => ({
    mes: '04-Abril',
    carpeta: `${i}-Opel-Astra-8061KRN`,
    matricula_norm: '8061KRN',
    archivos: [{ nombre: 'FRA.pdf', hash: 'h-compra' }],
  }))

  it('trocea: corta el trabajo en lotes en vez de mandarlo todo junto', async () => {
    mockLecturas({ snapshot: SNAPSHOT_GRANDE })
    let id = 1
    mockQuery.mockImplementation(((sql: string, params: unknown[]) => {
      if (/INSERT INTO expedientes_renombres/.test(String(sql))) {
        const rows = []
        for (let i = 0; i * 9 < (params?.length ?? 0); i++) {
          rows.push({
            id: id++,
            carpeta: String(params[i * 9 + 3]),
            nombre_original: String(params[i * 9 + 4]),
          })
        }
        return Promise.resolve({ rows })
      }
      return Promise.resolve({ rows: [] })
    }) as never)
    ;(global.fetch as jest.Mock).mockImplementation(async (_url: string, init: { body: string }) => {
      const payload = JSON.parse(init.body)
      return {
        ok: true,
        status: 200,
        json: async () => ({
          ok: true,
          resultados: payload.renombrar.map((r: { carpeta: string; de: string; a: string }) => ({
            carpeta: r.carpeta,
            nombre: r.de,
            destino: r.a,
            accion: 'renombrado',
            ok: true,
          })),
        }),
      }
    })

    const body = await (
      await POST(makeRequest({ year: 2026, quarter: 2, dryRun: false }))
    ).json()

    // 12 operaciones, lotes de 8 → 2 llamadas al webhook (nunca una sola gigante).
    const llamadas = (global.fetch as jest.Mock).mock.calls
    expect(llamadas.length).toBe(2)
    for (const [, init] of llamadas) {
      const payload = JSON.parse((init as { body: string }).body)
      expect(payload.renombrar.length + payload.borrar.length).toBeLessThanOrEqual(8)
    }
    // Y una tanda de INSERT por lote (la intención de ESE lote, antes de mandarlo).
    expect(inserts()).toHaveLength(2)
    expect(body.completado).toBe(true)
    expect(body.procesados).toBe(12)
    expect(body.restantes).toBe(0)
  })

  it('lote parcial: responde completado:false con lo que falta (sin 502)', async () => {
    mockLecturas({ snapshot: SNAPSHOT_GRANDE })
    let id = 1
    mockQuery.mockImplementation(((sql: string, params: unknown[]) => {
      if (/INSERT INTO expedientes_renombres/.test(String(sql))) {
        const rows = []
        for (let i = 0; i * 9 < (params?.length ?? 0); i++) {
          rows.push({
            id: id++,
            carpeta: String(params[i * 9 + 3]),
            nombre_original: String(params[i * 9 + 4]),
          })
        }
        return Promise.resolve({ rows })
      }
      return Promise.resolve({ rows: [] })
    }) as never)
    // Primer lote OK; en el segundo el server se cae.
    ;(global.fetch as jest.Mock)
      .mockImplementationOnce(async (_url: string, init: { body: string }) => {
        const payload = JSON.parse(init.body)
        return {
          ok: true,
          status: 200,
          json: async () => ({
            ok: true,
            resultados: payload.renombrar.map((r: { carpeta: string; de: string; a: string }) => ({
              carpeta: r.carpeta,
              nombre: r.de,
              destino: r.a,
              accion: 'renombrado',
              ok: true,
            })),
          }),
        }
      })
      .mockRejectedValueOnce(new Error('socket hang up'))

    const res = await POST(makeRequest({ year: 2026, quarter: 2, dryRun: false }))
    const body = await res.json()

    expect(res.status).toBe(200) // no 502: se devuelve el progreso
    expect(body.completado).toBe(false)
    expect(body.procesados).toBe(8)
    expect(body.restantes).toBe(4)
    expect(body.siguienteLote).toBe('8-Opel-Astra-8061KRN')
    expect(body.renombrados).toHaveLength(8)
    expect(body.error).toMatch(/socket hang up/)
  })

  it('reanuda: lo ya renombrado (traza aplicada) no se vuelve a tocar', async () => {
    // La corrida anterior aplicó 8 de las 12; la traza lo dice, el snapshot no
    // (el cron lo refresca a las 21:15).
    const trazaPrevia = SNAPSHOT_GRANDE.slice(0, 8).map((c, i) => ({
      id: i + 1,
      carpeta: c.carpeta,
      nombre_original: 'FRA.pdf',
      nombre_nuevo: CANONICO_COMPRA,
      accion: 'renombrado',
      estado: 'aplicado',
    }))
    mockLecturas({ snapshot: SNAPSHOT_GRANDE, traza: trazaPrevia })
    let id = 100
    mockQuery.mockImplementation(((sql: string, params: unknown[]) => {
      if (/INSERT INTO expedientes_renombres/.test(String(sql))) {
        const rows = []
        for (let i = 0; i * 9 < (params?.length ?? 0); i++) {
          rows.push({
            id: id++,
            carpeta: String(params[i * 9 + 3]),
            nombre_original: String(params[i * 9 + 4]),
          })
        }
        return Promise.resolve({ rows })
      }
      return Promise.resolve({ rows: [] })
    }) as never)
    ;(global.fetch as jest.Mock).mockImplementation(async (_url: string, init: { body: string }) => {
      const payload = JSON.parse(init.body)
      return {
        ok: true,
        status: 200,
        json: async () => ({
          ok: true,
          resultados: payload.renombrar.map((r: { carpeta: string; de: string; a: string }) => ({
            carpeta: r.carpeta,
            nombre: r.de,
            destino: r.a,
            accion: 'renombrado',
            ok: true,
          })),
        }),
      }
    })

    const body = await (
      await POST(makeRequest({ year: 2026, quarter: 2, dryRun: false }))
    ).json()

    // Sólo se piden las 4 que faltaban; las 8 hechas salen como ya canónicas.
    expect(body.total).toBe(4)
    expect(body.procesados).toBe(4)
    expect(body.completado).toBe(true)
    expect(body.yaCanonicos).toHaveLength(8)
    const pedidos = (global.fetch as jest.Mock).mock.calls.flatMap(
      ([, init]) => JSON.parse((init as { body: string }).body).renombrar
    )
    expect(pedidos).toHaveLength(4)
    expect(pedidos.map((r: { carpeta: string }) => r.carpeta)).toEqual([
      '8-Opel-Astra-8061KRN',
      '9-Opel-Astra-8061KRN',
      '10-Opel-Astra-8061KRN',
      '11-Opel-Astra-8061KRN',
    ])
  })

  it('reusa la intención pendiente de la corrida muerta: no duplica filas en la traza', async () => {
    const trazaPendiente = [
      {
        id: 7,
        carpeta: '74-Opel-Astra-8061KRN',
        nombre_original: 'FRA.pdf',
        nombre_nuevo: CANONICO_COMPRA,
        accion: 'renombrado',
        estado: 'pendiente',
      },
    ]
    mockLecturas({ traza: trazaPendiente })
    mockIntencion(20)
    mockQuery.mockResolvedValue({ rows: [] })
    ;(global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({
        ok: true,
        resultados: [
          {
            carpeta: '74-Opel-Astra-8061KRN',
            nombre: 'FRA.pdf',
            destino: CANONICO_COMPRA,
            accion: 'renombrado',
            ok: true,
          },
        ],
      }),
    })

    await POST(makeRequest({ year: 2026, quarter: 2, dryRun: false }))

    // Se insertan las 2 operaciones nuevas, NO la que ya tenía fila pendiente.
    const params = inserts()[0][1] as unknown[]
    expect(params.length).toBe(18) // 2 ops × 9
    const nombres = [params[4], params[13]]
    expect(nombres).not.toContain('FRA.pdf')
    // Y la fila pendiente #7 se confirma (no se crea otra).
    expect(updates().some((c) => (c[1] as unknown[])[0] === 7)).toBe(true)
  })

  it('segunda corrida sobre lo ya renombrado: no hace nada ni ensucia la traza', async () => {
    const traza = [
      {
        id: 1,
        carpeta: '74-Opel-Astra-8061KRN',
        nombre_original: 'copia-FRA.pdf',
        nombre_nuevo: null,
        accion: 'borrado',
        estado: 'aplicado',
      },
      {
        id: 2,
        carpeta: '74-Opel-Astra-8061KRN',
        nombre_original: 'FRA.pdf',
        nombre_nuevo: CANONICO_COMPRA,
        accion: 'renombrado',
        estado: 'aplicado',
      },
      {
        id: 3,
        carpeta: '74-Opel-Astra-8061KRN',
        nombre_original: 'factura-venta (1).pdf',
        nombre_nuevo: CANONICO_VENTA,
        accion: 'renombrado',
        estado: 'aplicado',
      },
    ]
    mockLecturas({ traza })
    mockQuery.mockResolvedValue({ rows: [] })

    const body = await (
      await POST(makeRequest({ year: 2026, quarter: 2, dryRun: false }))
    ).json()

    expect(body.total).toBe(0)
    expect(body.completado).toBe(true)
    expect(body.nota).toMatch(/No había nada que renombrar/)
    expect(global.fetch).not.toHaveBeenCalled()
    expect(inserts()).toHaveLength(0) // sin filas nuevas
    expect(updates()).toHaveLength(0)
    expect(body.yaCanonicos.map((y: { nombre: string }) => y.nombre)).toEqual(
      expect.arrayContaining([CANONICO_COMPRA, CANONICO_VENTA])
    )
  })
})

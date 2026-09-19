/**
 * @jest-environment node
 *
 * POST /api/automatizaciones/worker/{reclamar,resultado} — la PC del dueño.
 * Auth sólo por X-Worker-Secret (503 sin variable, 401 incorrecto, nunca
 * ADMIN_SECRET). pg mockeado con un despachador por SQL.
 */
jest.mock('@/lib/direct-database', () => ({ pool: { query: jest.fn() } }))

import { NextRequest } from 'next/server'
import { pool } from '@/lib/direct-database'
import { POST as reclamarPOST } from '@/app/api/automatizaciones/worker/reclamar/route'
import { POST as resultadoPOST } from '@/app/api/automatizaciones/worker/resultado/route'

const mockQuery = pool.query as unknown as jest.Mock
const SECRET = 'secreto-worker'

const TRABAJO = {
  id: 12,
  tipo: 'cambio_precio',
  modo: 'simular',
  referencia: '#1033',
  matricula: '6913MDM',
  vehiculo_id: 345,
}

function req(path: string, body: unknown, secret: string | null = SECRET) {
  return new NextRequest(
    `http://localhost/api/automatizaciones/worker/${path}`,
    {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        ...(secret ? { 'x-worker-secret': secret } : {}),
      },
      body: JSON.stringify(body),
    }
  )
}

/** Responde según el SQL: latido, limpieza, claim, actividad, resultado. */
function db(opts: {
  claim?: unknown[]
  actividad?: { pendientes: number; desde_s: number | null }
  resultado?: unknown[]
}) {
  mockQuery.mockImplementation(async (sql: string) => {
    if (sql.includes('INSERT INTO automatizacion_workers')) return { rows: [] }
    if (sql.includes('WITH caducados')) return { rows: [{ caducados: 0 }] }
    if (sql.includes('FOR UPDATE SKIP LOCKED'))
      return { rows: opts.claim ?? [] }
    if (sql.includes('AS pendientes'))
      return { rows: [opts.actividad ?? { pendientes: 0, desde_s: null }] }
    if (sql.includes("estado = 'en_curso'") && sql.includes('SET estado = $2'))
      return { rows: opts.resultado ?? [] }
    throw new Error(`SQL inesperado: ${sql.slice(0, 60)}`)
  })
}

const sqls = () => mockQuery.mock.calls.map((c) => String(c[0]))

beforeEach(() => {
  mockQuery.mockReset()
  process.env.AUTOMATIZACIONES_WORKER_SECRET = SECRET
  process.env.ADMIN_SECRET = 'admin-secret'
})

afterEach(() => {
  delete process.env.AUTOMATIZACIONES_WORKER_SECRET
  delete process.env.ADMIN_SECRET
})

describe('auth del worker', () => {
  it.each([
    ['reclamar', reclamarPOST, { worker: 'pc-seb' }],
    ['resultado', resultadoPOST, { id: 1, rc: 0 }],
  ])(
    '%s: 503 sin variable, 401 sin/incorrecto/ADMIN_SECRET',
    async (path, POST, body) => {
      delete process.env.AUTOMATIZACIONES_WORKER_SECRET
      expect((await POST(req(path, body))).status).toBe(503)

      process.env.AUTOMATIZACIONES_WORKER_SECRET = SECRET
      expect((await POST(req(path, body, null))).status).toBe(401)
      expect((await POST(req(path, body, 'otro'))).status).toBe(401)
      expect((await POST(req(path, body, 'admin-secret'))).status).toBe(401)
      expect(mockQuery).not.toHaveBeenCalled()
    }
  )
})

describe('POST /worker/reclamar', () => {
  it('sin trabajo: registra latido y devuelve null con proximo_s 45', async () => {
    db({})
    const res = await reclamarPOST(
      req('reclamar', { worker: 'pc-seb', version: 'v1' })
    )
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ trabajo: null, proximo_s: 45 })
    const latido = mockQuery.mock.calls.find((c) =>
      String(c[0]).includes('INSERT INTO automatizacion_workers')
    )
    expect(latido?.[1]).toEqual(['pc-seb', 'v1'])
  })

  it('con actividad reciente → proximo_s 10', async () => {
    db({ actividad: { pendientes: 0, desde_s: 120 } })
    const res = await reclamarPOST(req('reclamar', { worker: 'pc-seb' }))
    expect(await res.json()).toEqual({ trabajo: null, proximo_s: 10 })
  })

  it('reclama un trabajo con el formato del contrato', async () => {
    db({ claim: [TRABAJO] })
    const res = await reclamarPOST(req('reclamar', { worker: 'pc-seb' }))
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ trabajo: TRABAJO, proximo_s: 10 })
    const claim = mockQuery.mock.calls.find((c) =>
      String(c[0]).includes('FOR UPDATE SKIP LOCKED')
    )
    expect(claim?.[1]).toEqual(['pc-seb', 'sheets_vehiculo'])
  })

  it('solo_latido: registra el latido pero no reclama', async () => {
    db({ claim: [TRABAJO] })
    const res = await reclamarPOST(
      req('reclamar', { worker: 'pc-seb', solo_latido: true })
    )
    expect((await res.json()).trabajo).toBeNull()
    expect(
      sqls().some((s) => s.includes('INSERT INTO automatizacion_workers'))
    ).toBe(true)
    expect(sqls().some((s) => s.includes('FOR UPDATE SKIP LOCKED'))).toBe(false)
  })

  it('400 sin worker o con JSON inválido', async () => {
    expect(
      (await reclamarPOST(req('reclamar', { version: 'v1' }))).status
    ).toBe(400)
    const malo = new NextRequest(
      'http://localhost/api/automatizaciones/worker/reclamar',
      {
        method: 'POST',
        headers: { 'x-worker-secret': SECRET },
        body: '{',
      }
    )
    expect((await reclamarPOST(malo)).status).toBe(400)
    expect(mockQuery).not.toHaveBeenCalled()
  })

  it('500 si falla la DB', async () => {
    mockQuery.mockRejectedValue(new Error('boom'))
    expect(
      (await reclamarPOST(req('reclamar', { worker: 'pc-seb' }))).status
    ).toBe(500)
  })
})

describe('POST /worker/resultado', () => {
  it('rc 0 → ok; guarda salida, para_verificar y url', async () => {
    db({ resultado: [{ id: 12 }] })
    const res = await resultadoPOST(
      req('resultado', {
        id: 12,
        worker: 'pc-seb',
        rc: 0,
        salida: 'todo bien',
        para_verificar: ['revisar cuota'],
        url: 'https://sevencars.es/?p=9',
      })
    )
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ ok: true })
    expect(mockQuery.mock.calls[0][1]).toEqual([
      12,
      'ok',
      0,
      'todo bien',
      JSON.stringify(['revisar cuota']),
      'https://sevencars.es/?p=9',
      'pc-seb',
    ])
  })

  it('rc distinto de 0 → error; salida recortada a 100 KB', async () => {
    db({ resultado: [{ id: 12 }] })
    const salida = 'x'.repeat(300 * 1024)
    const res = await resultadoPOST(req('resultado', { id: 12, rc: 3, salida }))
    expect(res.status).toBe(200)
    const params = mockQuery.mock.calls[0][1]
    expect(params[1]).toBe('error')
    expect(Buffer.byteLength(params[3])).toBeLessThanOrEqual(100 * 1024)
  })

  it('409 si el trabajo no existe o no está en_curso', async () => {
    db({ resultado: [] })
    const res = await resultadoPOST(req('resultado', { id: 99, rc: 0 }))
    expect(res.status).toBe(409)
  })

  it('400 con id o rc inválidos', async () => {
    expect((await resultadoPOST(req('resultado', { rc: 0 }))).status).toBe(400)
    expect(
      (await resultadoPOST(req('resultado', { id: 1, rc: 'x' }))).status
    ).toBe(400)
    expect(mockQuery).not.toHaveBeenCalled()
  })
})

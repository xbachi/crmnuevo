/**
 * @jest-environment node
 *
 * GET /api/cron/alertas — auth, respuesta sin alertas, email y bandeja.
 * pg y mailer mockeados.
 */
import type { NextRequest } from 'next/server'

jest.mock('@/lib/direct-database', () => ({ pool: { query: jest.fn() } }))
jest.mock('@/lib/mailer', () => ({ sendMail: jest.fn() }))

import { GET, POST } from '@/app/api/cron/alertas/route'
import { pool } from '@/lib/direct-database'
import { sendMail } from '@/lib/mailer'

const mockQuery = pool.query as unknown as jest.Mock
const mockSend = sendMail as unknown as jest.Mock

const CRON = 'cron-test-secret'
const ADMIN = 'admin-test-secret'
process.env.CRON_SECRET = CRON
process.env.ADMIN_SECRET = ADMIN
delete process.env.ALERTAS_EMAIL_TO

function makeReq(headers: Record<string, string> = {}): NextRequest {
  const h = Object.fromEntries(
    Object.entries(headers).map(([k, v]) => [k.toLowerCase(), v])
  )
  return {
    url: 'http://localhost/api/cron/alertas',
    headers: { get: (k: string) => h[k.toLowerCase()] ?? null },
  } as unknown as NextRequest
}

beforeEach(() => {
  mockQuery.mockReset()
  mockSend.mockReset().mockResolvedValue({ sent: true })
})

describe('GET /api/cron/alertas', () => {
  it('401 sin secreto', async () => {
    const res = await GET(makeReq())
    expect(res.status).toBe(401)
    expect(mockQuery).not.toHaveBeenCalled()
    expect(mockSend).not.toHaveBeenCalled()
  })

  it('401 con secreto incorrecto', async () => {
    const res = await GET(makeReq({ authorization: 'Bearer nope' }))
    expect(res.status).toBe(401)
  })

  it('sin alertas: email omitido, bandeja vacía, sin sendMail', async () => {
    mockQuery.mockResolvedValue({ rows: [] })
    const res = await GET(makeReq({ authorization: `Bearer ${CRON}` }))
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json).toMatchObject({
      ok: true,
      total: 0,
      porTipo: {},
      bandeja: { nuevos: 0, existentes: 0 },
      email: 'omitido',
      errores: [],
    })
    expect(mockSend).not.toHaveBeenCalled()
    // ningún INSERT en la bandeja
    const sqls = mockQuery.mock.calls.map((c) => String(c[0]))
    expect(sqls.some((s) => /INSERT INTO revision_items/.test(s))).toBe(false)
  })

  it('con alertas: encola, manda el digest y acepta X-Admin-Secret y POST', async () => {
    mockQuery.mockImplementation(async (sql: string) => {
      if (String(sql).includes('"fechaReservaExpira" <')) {
        return {
          rows: [
            {
              id: 1,
              numero: 'D-1',
              cliente_nombre: 'Ana',
              cliente_apellidos: null,
              vehiculo_marca: 'Seat',
              vehiculo_modelo: 'León',
              vehiculo_matricula: null,
              fechaReservaExpira: new Date(Date.now() - 2 * 86_400_000),
            },
          ],
        }
      }
      if (String(sql).includes('INSERT INTO revision_items')) {
        return { rows: [{ dedup_key: 'alertas:reserva-caducada:deal:1' }] }
      }
      return { rows: [] }
    })
    const res = await POST(makeReq({ 'x-admin-secret': ADMIN }))
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json).toMatchObject({
      ok: true,
      total: 1,
      porTipo: { 'reserva-caducada': 1 },
      bandeja: { nuevos: 1, existentes: 0 },
      email: 'enviado',
    })
    expect(mockSend).toHaveBeenCalledTimes(1)
    const mail = mockSend.mock.calls[0][0]
    expect(mail.to).toBe('hola@sevencars.es')
    expect(mail.subject).toMatch(/^Alertas CRM \d{2}\/\d{2}\/\d{4}: 1 aviso$/)
    expect(mail.html).toContain('/deals/1')
  })

  it('si la bandeja falla, lo reporta en errores y avisa el fallo del cron', async () => {
    mockQuery.mockImplementation(async (sql: string) => {
      if (String(sql).includes('"restoAPagar" > 0')) {
        return {
          rows: [
            {
              id: 6,
              numero: 'D-6',
              cliente_nombre: 'Luis',
              cliente_apellidos: 'Pérez',
              vehiculo_marca: 'Audi',
              vehiculo_modelo: 'A3',
              vehiculo_matricula: '9999ZZZ',
              estado: 'vendido',
              restoAPagar: 500,
              desde: new Date(Date.now() - 10 * 86_400_000),
            },
          ],
        }
      }
      if (String(sql).includes('INSERT INTO revision_items')) {
        throw new Error(
          'violates check constraint "revision_items_origen_check"'
        )
      }
      return { rows: [] }
    })
    const res = await GET(makeReq({ authorization: `Bearer ${CRON}` }))
    const json = await res.json()
    expect(json.ok).toBe(false)
    expect(json.errores).toEqual([
      {
        tipo: 'bandeja',
        error: expect.stringContaining('revision_items_origen_check'),
      },
    ])
    expect(json.email).toBe('enviado')
    // digest + aviso de fallo
    expect(mockSend).toHaveBeenCalledTimes(2)
    const asuntos = mockSend.mock.calls.map((c) => c[0].subject)
    expect(asuntos).toEqual([
      expect.stringMatching(/^Alertas CRM /),
      '[CRM] Fallo del cron alertas',
    ])
  })
})

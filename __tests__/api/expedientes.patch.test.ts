/**
 * @jest-environment node
 *
 * PATCH /api/expedientes/[id] — edición manual de checklist y estado.
 * Regla dura: nunca pasar a completo/enviado/confirmado con requeridos
 * faltantes (422). pool mockeado; la sesión se mockea vía apiAuth.
 */

jest.mock('@/lib/direct-database', () => ({
  pool: { query: jest.fn() },
}))
jest.mock('@/lib/apiAuth', () => ({
  requireApiSession: jest.fn(() => ({ session: { user: 'test', role: 'admin' } })),
}))

import { NextRequest } from 'next/server'
import { pool } from '@/lib/direct-database'
import { PATCH } from '@/app/api/expedientes/[id]/route'
import type { ChecklistItem } from '@/lib/expedienteChecklist'

const mockQuery = pool.query as jest.Mock

function makeRequest(body: unknown) {
  return new NextRequest('http://localhost/api/expedientes/5', {
    method: 'PATCH',
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  })
}

const params = Promise.resolve({ id: '5' })

const checklist = (facturaCompra: boolean): ChecklistItem[] => [
  { clave: 'factura-venta', label: 'Factura de venta', requerido: true, presente: true },
  { clave: 'contrato-venta', label: 'Contrato de venta', requerido: true, presente: true },
  { clave: 'factura-compra', label: 'Factura de compra', requerido: true, presente: facturaCompra },
]

beforeEach(() => {
  jest.clearAllMocks()
})

describe('PATCH /api/expedientes/[id]', () => {
  it('devuelve 422 al intentar pasar a completo con requeridos faltantes', async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [{ id: 5, estado: 'incompleto', checklist: checklist(false) }],
    })

    const res = await PATCH(makeRequest({ estado: 'completo' }), { params })
    const body = await res.json()

    expect(res.status).toBe(422)
    expect(body.faltantes).toEqual(['factura-compra'])
    // nunca llegó al UPDATE
    expect(mockQuery).toHaveBeenCalledTimes(1)
  })

  it('devuelve 422 también para enviado/confirmado con faltantes', async () => {
    for (const estado of ['enviado', 'confirmado']) {
      mockQuery.mockReset()
      mockQuery.mockResolvedValueOnce({
        rows: [{ id: 5, estado: 'incompleto', checklist: checklist(false) }],
      })
      const res = await PATCH(makeRequest({ estado }), { params })
      expect(res.status).toBe(422)
    }
  })

  it('marca un item a mano y re-evalúa el estado (incompleto → completo)', async () => {
    mockQuery
      .mockResolvedValueOnce({
        rows: [{ id: 5, estado: 'incompleto', checklist: checklist(false) }],
      })
      .mockImplementationOnce(async (_sql: string, values: unknown[]) => ({
        rows: [{ id: 5, estado: values[1], checklist: JSON.parse(values[0] as string) }],
      }))

    const res = await PATCH(
      makeRequest({ clave: 'factura-compra', presente: true, nota: 'verificada a mano' }),
      { params }
    )
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.expediente.estado).toBe('completo')
    const [, values] = mockQuery.mock.calls[1]
    const saved = JSON.parse(values[0] as string) as ChecklistItem[]
    const item = saved.find((i) => i.clave === 'factura-compra')
    expect(item).toMatchObject({ presente: true, nota: 'verificada a mano' })
  })

  it('desmarcar un requerido degrada enviado → incompleto', async () => {
    mockQuery
      .mockResolvedValueOnce({
        rows: [{ id: 5, estado: 'enviado', checklist: checklist(true) }],
      })
      .mockImplementationOnce(async (_sql: string, values: unknown[]) => ({
        rows: [{ id: 5, estado: values[1], checklist: JSON.parse(values[0] as string) }],
      }))

    const res = await PATCH(
      makeRequest({ clave: 'factura-compra', presente: false }),
      { params }
    )
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.expediente.estado).toBe('incompleto')
  })

  it('permite la transición manual completo → enviado con la checklist completa', async () => {
    mockQuery
      .mockResolvedValueOnce({
        rows: [{ id: 5, estado: 'completo', checklist: checklist(true) }],
      })
      .mockImplementationOnce(async (_sql: string, values: unknown[]) => ({
        rows: [{ id: 5, estado: values[1], checklist: JSON.parse(values[0] as string) }],
      }))

    const res = await PATCH(makeRequest({ estado: 'enviado' }), { params })
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.expediente.estado).toBe('enviado')
  })

  it('404 si el expediente no existe, 400 si no hay nada que actualizar', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] })
    const notFound = await PATCH(makeRequest({ estado: 'completo' }), { params })
    expect(notFound.status).toBe(404)

    const empty = await PATCH(makeRequest({}), { params })
    expect(empty.status).toBe(400)
  })
})

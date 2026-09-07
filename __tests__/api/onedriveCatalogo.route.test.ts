/**
 * @jest-environment node
 *
 * GET /api/onedrive/catalogo — catálogo de solo lectura matrícula → nº de
 * carpeta. pool mockeado; el foco está en la auth y en refCarpeta (que es
 * helper local del route, se verifica a través de la respuesta).
 */

jest.mock('@/lib/direct-database', () => ({
  pool: { query: jest.fn() },
}))

import { NextRequest } from 'next/server'
import { pool } from '@/lib/direct-database'
import { GET } from '@/app/api/onedrive/catalogo/route'

const mockQuery = pool.query as jest.Mock
const SECRET = 'test-admin-secret'

function makeRequest(secret: string | null = SECRET) {
  return new NextRequest('http://localhost/api/onedrive/catalogo', {
    method: 'GET',
    headers: secret ? { 'x-admin-secret': secret } : {},
  })
}

type Row = {
  referencia: string | null
  marca: string | null
  modelo: string | null
  matricula: string | null
  matricula_norm: string | null
  tipo: string | null
}

function row(partial: Partial<Row>): Row {
  return {
    referencia: null,
    marca: 'Opel',
    modelo: 'Astra',
    matricula: '0483MBJ',
    matricula_norm: '0483MBJ',
    tipo: 'C',
    ...partial,
  }
}

async function refsFor(rows: Row[]) {
  mockQuery.mockResolvedValueOnce({ rows })
  const res = await GET(makeRequest())
  expect(res.status).toBe(200)
  const body = await res.json()
  return body.vehiculos.map((v: { ref: string | null }) => v.ref)
}

beforeEach(() => {
  jest.clearAllMocks()
  process.env.ADMIN_SECRET = SECRET
})

afterEach(() => {
  delete process.env.ADMIN_SECRET
})

describe('GET /api/onedrive/catalogo', () => {
  it('rechaza sin X-Admin-Secret', async () => {
    const res = await GET(makeRequest(null))
    expect(res.status).toBe(401)
    expect(await res.json()).toEqual({ error: 'unauthorized' })
    expect(mockQuery).not.toHaveBeenCalled()
  })

  it('rechaza con X-Admin-Secret incorrecto', async () => {
    const res = await GET(makeRequest('wrong'))
    expect(res.status).toBe(401)
    expect(mockQuery).not.toHaveBeenCalled()
  })

  it('rechaza si no hay secret configurado en el entorno', async () => {
    delete process.env.ADMIN_SECRET
    const res = await GET(makeRequest(null))
    expect(res.status).toBe(401)
    expect(mockQuery).not.toHaveBeenCalled()
  })

  it('devuelve el catálogo con campos trimeados', async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [
        row({
          referencia: '#1090',
          marca: ' Opel ',
          modelo: ' Astra ',
          matricula: ' 0483MBJ ',
        }),
      ],
    })

    const res = await GET(makeRequest())
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({
      ok: true,
      total: 1,
      vehiculos: [
        {
          matricula: '0483MBJ',
          matriculaNorm: '0483MBJ',
          ref: '90',
          marca: 'Opel',
          modelo: 'Astra',
          tipo: 'C',
        },
      ],
    })

    const sql = String(mockQuery.mock.calls[0][0])
    expect(sql).toContain('FROM "Vehiculo"')
    expect(sql).toContain('matricula_norm IS NOT NULL')
  })

  it('resuelve el nº de carpeta según referencia y tipo', async () => {
    const refs = await refsFor([
      row({ referencia: '#1090', tipo: 'C' }), // rango 1000-1099 → sin padding
      row({ referencia: '1005', tipo: 'C' }), // 1005 → '5', no '05'
      row({ referencia: '#1150', tipo: 'C' }), // rango 1100-1199 → 150
      row({ referencia: 'D-38', tipo: 'D' }), // prefijo explícito
      row({ referencia: '#R-11', tipo: 'Coche R' }), // legacy 'Coche R' → R
      row({ referencia: '#1038', tipo: 'Deposito Venta' }), // legacy → D-38
      row({ referencia: 'MAN-E9961BDJ-15169', tipo: 'M' }), // no hay carpeta
      row({ referencia: 'SIN-NUMERO', tipo: 'C' }), // sin dígitos → null
      row({ referencia: null, tipo: 'C' }),
    ])

    expect(refs).toEqual([
      '90',
      '5',
      '150',
      'D-38',
      'R-11',
      'D-38',
      null,
      null,
      null,
    ])
  })

  it('devuelve 500 si falla la query', async () => {
    mockQuery.mockRejectedValueOnce(new Error('boom'))
    const res = await GET(makeRequest())
    expect(res.status).toBe(500)
    expect(await res.json()).toMatchObject({ ok: false, error: 'boom' })
  })
})

/**
 * @jest-environment node
 *
 * GET /api/public/stock — feed público de stock. pg y @vercel/blob mockeados.
 */
import type { NextRequest } from 'next/server'

jest.mock('@/lib/direct-database', () => ({ pool: { query: jest.fn() } }))
jest.mock('@vercel/blob', () => ({ list: jest.fn() }))

import { GET } from '@/app/api/public/stock/route'
import { pool } from '@/lib/direct-database'
import { list } from '@vercel/blob'

const mockQuery = pool.query as unknown as jest.Mock
const mockList = list as unknown as jest.Mock

const TOKEN = 'feed-token-de-prueba'

function makeReq(
  opts: {
    query?: Record<string, string>
    header?: string | null
  } = {}
): NextRequest {
  const qs = new URLSearchParams(opts.query ?? {}).toString()
  return {
    url: `http://localhost/api/public/stock${qs ? `?${qs}` : ''}`,
    headers: {
      get: (k: string) =>
        k.toLowerCase() === 'x-feed-token' ? (opts.header ?? null) : null,
    },
  } as unknown as NextRequest
}

const FILAS = [
  {
    id: 1,
    referencia: '#101',
    marca: 'Seat',
    modelo: 'León',
    matricula: '1234ABC',
    kms: 50000,
    anio: 2020,
    color: 'Rojo',
    estado: 'PUBLICADO',
    precioPublicacion: 15990,
    combustible: 'Diésel',
    // Campos internos que NUNCA deben salir aunque lleguen en la fila.
    precioCompra: 9000,
    bastidor: 'VSSZZZ5FZLR000001',
    inversorId: 3,
    notasInversor: 'secreto',
  },
  {
    id: 2,
    referencia: '#102',
    marca: 'Fiat',
    modelo: '500 S&S <Lounge>',
    matricula: '5678DEF',
    kms: 12000,
    anio: 2022,
    color: null,
    estado: ' publicado ',
    precioPublicacion: null,
    combustible: null,
    precioCompra: 7000,
    bastidor: 'ZFA3120000J000002',
    inversorId: null,
  },
  {
    id: 3,
    referencia: '#103',
    marca: 'Ford',
    modelo: 'Focus',
    matricula: '9999ZZZ',
    kms: 80000,
    anio: 2018,
    color: 'Azul',
    estado: 'VENDIDO',
    precioPublicacion: 9990,
    combustible: 'Gasolina',
    precioCompra: 6000,
    bastidor: 'WF0XXX',
    inversorId: null,
  },
]

/** El mock responde según la SQL: columnas opcionales primero, luego filas. */
function mockDb(filas = FILAS, columnas = ['combustible']) {
  mockQuery
    .mockReset()
    .mockImplementation(async (sql: string) =>
      sql.includes('information_schema')
        ? { rows: columnas.map((column_name) => ({ column_name })) }
        : { rows: filas }
    )
}

describe('GET /api/public/stock', () => {
  beforeEach(() => {
    process.env.PUBLIC_FEED_TOKEN = TOKEN
    delete process.env.BLOB_READ_WRITE_TOKEN
    delete process.env.NEXT_PUBLIC_APP_URL
    mockList.mockReset().mockResolvedValue({ blobs: [] })
    mockDb()
  })

  it('503 si PUBLIC_FEED_TOKEN no está configurado', async () => {
    delete process.env.PUBLIC_FEED_TOKEN
    const res = await GET(makeReq({ query: { token: TOKEN } }))
    expect(res.status).toBe(503)
    expect(await res.json()).toEqual({ error: 'Feed no configurado' })
    expect(mockQuery).not.toHaveBeenCalled()
  })

  it('401 sin token o con token incorrecto', async () => {
    expect((await GET(makeReq())).status).toBe(401)
    expect((await GET(makeReq({ query: { token: 'malo' } }))).status).toBe(401)
    expect((await GET(makeReq({ header: 'malo' }))).status).toBe(401)
    expect(mockQuery).not.toHaveBeenCalled()
  })

  it('acepta el token por cabecera X-Feed-Token', async () => {
    const res = await GET(makeReq({ header: TOKEN }))
    expect(res.status).toBe(200)
  })

  it('JSON: solo campos públicos, solo PUBLICADO, matrícula ocultada', async () => {
    const res = await GET(makeReq({ query: { token: TOKEN } }))
    expect(res.status).toBe(200)
    const json = await res.json()

    expect(new Date(json.generado).toString()).not.toBe('Invalid Date')
    expect(json.total).toBe(2)
    expect(json.vehiculos.map((v: { id: number }) => v.id)).toEqual([1, 2])

    expect(json.vehiculos[0]).toEqual({
      id: 1,
      referencia: '#101',
      marca: 'Seat',
      modelo: 'León',
      version: null,
      anio: 2020,
      kms: 50000,
      combustible: 'Diésel',
      cambio: null,
      color: 'Rojo',
      precio: 15990,
      matricula: '1234 ***',
      fotos: [],
      url: 'https://sevencars.vercel.app/vehiculos/1',
    })
    expect(json.vehiculos[1]).toMatchObject({
      id: 2,
      matricula: '5678 ***',
      precio: null,
      color: null,
    })

    const raw = JSON.stringify(json)
    for (const prohibido of [
      'precioCompra',
      'bastidor',
      'inversorId',
      'notasInversor',
      'VSSZZZ',
      '1234ABC',
      'secreto',
    ]) {
      expect(raw).not.toContain(prohibido)
    }
  })

  it('solo pide a la DB las columnas opcionales que existen', async () => {
    await GET(makeReq({ query: { token: TOKEN } }))
    const sqlFilas = mockQuery.mock.calls.find(
      ([sql]) => !String(sql).includes('information_schema')
    )?.[0] as string
    expect(sqlFilas).toContain('v."combustible"')
    expect(sqlFilas).not.toContain('v."cambio"')
    expect(sqlFilas).not.toContain('v."version"')
    expect(sqlFilas).not.toContain('precioCompra')
    expect(sqlFilas).not.toContain('bastidor')
  })

  it('usa NEXT_PUBLIC_APP_URL para la url pública si está', async () => {
    process.env.NEXT_PUBLIC_APP_URL = 'https://www.sevencars.es/'
    const res = await GET(makeReq({ query: { token: TOKEN } }))
    const json = await res.json()
    expect(json.vehiculos[0].url).toBe('https://www.sevencars.es/vehiculos/1')
  })

  it('cabecera de caché pública en JSON y XML', async () => {
    const esperado = 'public, s-maxage=300, stale-while-revalidate=600'
    const json = await GET(makeReq({ query: { token: TOKEN } }))
    expect(json.headers.get('cache-control')).toBe(esperado)
    const xml = await GET(makeReq({ query: { token: TOKEN, formato: 'xml' } }))
    expect(xml.headers.get('cache-control')).toBe(esperado)
  })

  it('las respuestas de error no se cachean', async () => {
    const res = await GET(makeReq({ query: { token: 'malo' } }))
    expect(res.headers.get('cache-control')).toBe('no-store')
  })

  it('?formato=xml: XML con escapado correcto y sin campos internos', async () => {
    const res = await GET(makeReq({ query: { token: TOKEN, formato: 'xml' } }))
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toBe(
      'application/xml; charset=utf-8'
    )
    const xml = await res.text()

    expect(xml.startsWith('<?xml version="1.0" encoding="UTF-8"?>')).toBe(true)
    expect(xml).toMatch(/<stock generado="[^"]+" total="2">/)
    expect(xml).toContain('<modelo>500 S&amp;S &lt;Lounge&gt;</modelo>')
    expect(xml).toContain('<matricula>1234 ***</matricula>')
    expect(xml).toContain('<precio>15990</precio>')
    expect(xml).toContain('<fotos></fotos>')
    expect(xml.endsWith('</stock>')).toBe(true)
    // Ningún & suelto (todo entidad) y solo dos vehículos.
    expect(xml).not.toMatch(/&(?!amp;|lt;|gt;|quot;|apos;)/)
    expect(xml.match(/<vehiculo>/g)).toHaveLength(2)
    expect(xml).not.toContain('Focus')
    for (const prohibido of [
      'precioCompra',
      'bastidor',
      'inversorId',
      'VSSZZZ',
    ]) {
      expect(xml).not.toContain(prohibido)
    }
  })

  it('sin BLOB_READ_WRITE_TOKEN devuelve fotos: [] sin llamar al Blob', async () => {
    const res = await GET(makeReq({ query: { token: TOKEN } }))
    const json = await res.json()
    expect(
      json.vehiculos.every((v: { fotos: string[] }) => v.fotos.length === 0)
    ).toBe(true)
    expect(mockList).not.toHaveBeenCalled()
  })

  it('con Blob: solo imágenes, ordenadas por nombre, máx. 20, sin fallar si el Blob falla', async () => {
    process.env.BLOB_READ_WRITE_TOKEN = 'blob-token'
    const muchas = Array.from({ length: 25 }, (_, i) => ({
      pathname: `vehiculos/5678DEF/${String(i + 1).padStart(2, '0')}-foto.jpg`,
      url: `https://blob.test/5678DEF/${i + 1}.jpg`,
    }))
    mockList
      .mockReset()
      .mockImplementation(async ({ prefix }: { prefix: string }) => {
        if (prefix === 'vehiculos/1234ABC/') {
          return {
            blobs: [
              {
                pathname: 'vehiculos/1234ABC/2-b.jpg',
                url: 'https://blob.test/b.jpg',
              },
              {
                pathname: 'vehiculos/1234ABC/contrato.pdf',
                url: 'https://blob.test/contrato.pdf',
              },
              {
                pathname: 'vehiculos/1234ABC/1-a.png',
                url: 'https://blob.test/a.png',
              },
            ],
          }
        }
        if (prefix === 'vehiculos/1/') {
          return {
            blobs: [
              {
                pathname: 'vehiculos/1/0-legacy.webp',
                url: 'https://blob.test/legacy.webp',
              },
            ],
          }
        }
        if (prefix === 'vehiculos/5678DEF/') return { blobs: muchas }
        if (prefix === 'vehiculos/2/') throw new Error('blob caído')
        return { blobs: [] }
      })

    const res = await GET(makeReq({ query: { token: TOKEN } }))
    expect(res.status).toBe(200)
    const json = await res.json()

    expect(json.vehiculos[0].fotos).toEqual([
      'https://blob.test/legacy.webp',
      'https://blob.test/a.png',
      'https://blob.test/b.jpg',
    ])
    expect(json.vehiculos[1].fotos).toHaveLength(20)
    expect(json.vehiculos[1].fotos[0]).toBe('https://blob.test/5678DEF/1.jpg')
    expect(JSON.stringify(json)).not.toContain('contrato.pdf')
    // Solo se listan los coches publicados (2 prefijos por coche), no el vendido.
    expect(mockList).toHaveBeenCalledTimes(4)
    expect(mockList).not.toHaveBeenCalledWith(
      expect.objectContaining({ prefix: 'vehiculos/9999ZZZ/' })
    )
  })

  it('lista el Blob en lotes de como mucho 5 coches a la vez', async () => {
    process.env.BLOB_READ_WRITE_TOKEN = 'blob-token'
    const filas = Array.from({ length: 12 }, (_, i) => ({
      ...FILAS[0],
      id: i + 1,
      matricula: `${1000 + i}AAA`,
    }))
    mockDb(filas)

    let enCurso = 0
    let maximo = 0
    mockList.mockReset().mockImplementation(async () => {
      enCurso++
      maximo = Math.max(maximo, enCurso)
      await new Promise((r) => setImmediate(r))
      enCurso--
      return { blobs: [] }
    })

    const res = await GET(makeReq({ query: { token: TOKEN } }))
    expect((await res.json()).total).toBe(12)
    expect(mockList).toHaveBeenCalledTimes(24)
    expect(maximo).toBeLessThanOrEqual(5)
  })

  it('500 sin filtrar el error si la DB falla', async () => {
    mockQuery.mockReset().mockRejectedValue(new Error('db.internal caído'))
    const res = await GET(makeReq({ query: { token: TOKEN } }))
    expect(res.status).toBe(500)
    expect(JSON.stringify(await res.json())).not.toContain('db.internal')
  })
})

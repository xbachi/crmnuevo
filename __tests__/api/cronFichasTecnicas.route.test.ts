/**
 * @jest-environment node
 *
 * Cron de fichas técnicas: el relleno automático de los campos del permiso.
 * Sólo rellena huecos, sólo con confianza >= 0,80, deja fila en
 * vehiculo_campos_doc y no pisa nunca un valor que ya está.
 *
 * Todo lo externo (pg, correo, WordPress) va mockeado.
 */
import type { NextRequest } from 'next/server'

jest.mock('@/lib/direct-database', () => ({ pool: { query: jest.fn() } }))
jest.mock('@/lib/secrets', () => ({ safeEqual: jest.fn(() => true) }))
jest.mock('@/lib/mailer', () => ({
  sendMail: jest.fn(async () => ({ sent: true })),
}))
jest.mock('@/lib/alertas', () => ({
  baseUrl: () => 'https://crm.test',
  formatearFecha: () => '18/09/2026',
}))
jest.mock('@/lib/cronNotify', () => ({
  destinatarioAlertas: () => 'a@b.c',
  escapeHtml: (s: string) => s,
  notificarFalloCron: jest.fn(async () => undefined),
}))
jest.mock('@/lib/webSync', () => ({ fetchFichaWeb: jest.fn(async () => null) }))
jest.mock('@/lib/fichaComercial', () => ({
  escribirCamposFicha: jest.fn(async () => undefined),
}))
jest.mock('@/lib/vehiculoCamposDoc', () => ({
  registrarCampoDoc: jest.fn(async () => undefined),
}))

process.env.CRON_SECRET = 'test-cron-secret'

import { POST } from '@/app/api/cron/fichas-tecnicas/route'
import { pool } from '@/lib/direct-database'
import { escribirCamposFicha } from '@/lib/fichaComercial'
import { registrarCampoDoc } from '@/lib/vehiculoCamposDoc'

const mockQuery = pool.query as unknown as jest.Mock
const mockFicha = escribirCamposFicha as unknown as jest.Mock
const mockDoc = registrarCampoDoc as unknown as jest.Mock

const req = () =>
  ({
    headers: { get: () => 'secret' },
    url: 'http://localhost/api/cron/fichas-tecnicas',
  }) as unknown as NextRequest

/** Coche vacío: no tiene ni bastidor ni ningún dato de la ficha comercial. */
const VACIO = {
  id: 7,
  referencia: '1088',
  marca: 'KIA',
  modelo: 'CEED',
  matricula: '3429LHT',
  bastidor: null,
  color: 'Blanco',
  fechaMatriculacion: '2020-07-15',
  estado: 'FOTOS',
  combustible: null,
  cubicaje: null,
  motor_kw: null,
  motor_cv: null,
  plazas: null,
  nombre_comercial: null,
}

const campo = (valor: unknown, confianza: number) => ({ valor, confianza })

function fichaDe(campos: Record<string, unknown>) {
  return {
    id: 3,
    vehiculo_id: 7,
    hash: 'a'.repeat(32),
    carpeta: 'c',
    archivo: 'permiso.jpg',
    campos,
    extraido_at: null,
  }
}

/** Enruta cada consulta del cron por su SQL. */
function conectar(vehiculos: unknown[], fichas: unknown[]) {
  mockQuery.mockReset().mockImplementation(async (sql: string) => {
    if (sql.includes('FROM "Vehiculo" v')) return { rows: vehiculos }
    if (sql.includes('FROM fichas_tecnicas\n')) return { rows: fichas }
    if (sql.includes('vehiculo_campos_doc')) return { rows: [{ n: 0 }] }
    return { rows: [] }
  })
}

beforeEach(() => {
  mockFicha.mockClear()
  mockDoc.mockClear()
  jest.spyOn(console, 'warn').mockImplementation(() => {})
})
afterEach(() => jest.restoreAllMocks())

describe('relleno automático desde el permiso', () => {
  it('rellena los huecos con confianza >= 0,80 y deja todo por confirmar', async () => {
    conectar(
      [VACIO],
      [
        fichaDe({
          bastidor: campo('U5YPH81ADLL123456', 0.9),
          combustible: campo('GASÓLEO', 0.85),
          cilindrada_cc: campo('1.598 cc', 0.8),
          potencia_kw: campo(100, 0.95),
          potencia_cv: campo(136, 0.95),
          plazas: campo(5, 0.9),
          version: campo('1.6 CRDi Drive', 0.88),
        }),
      ]
    )

    const res = await POST(req())
    const json = await res.json()
    expect(json.ok).toBe(true)
    expect(json.rellenados).toBe(7)

    // Un solo upsert de ficha comercial con los seis campos, ya tipados.
    expect(mockFicha).toHaveBeenCalledTimes(1)
    expect(mockFicha.mock.calls[0][0]).toBe(7)
    expect(mockFicha.mock.calls[0][1]).toEqual({
      combustible: 'Diésel',
      cubicaje: 1598,
      motor_kw: 100,
      motor_cv: 136,
      plazas: 5,
      nombre_comercial: '1.6 CRDi Drive',
    })

    // El bastidor va a "Vehiculo".
    const updates = mockQuery.mock.calls.filter(
      (c: [string]) => typeof c[0] === 'string' && c[0].startsWith('UPDATE ')
    )
    expect(updates).toHaveLength(1)
    expect(updates[0][0]).toContain('"bastidor"')

    // Y los siete quedan pendientes de confirmar.
    expect(mockDoc).toHaveBeenCalledTimes(7)
    expect(
      mockDoc.mock.calls.map((c: [unknown, { campo: string }]) => c[1].campo)
    ).toEqual(
      expect.arrayContaining([
        'bastidor',
        'combustible',
        'cubicaje',
        'motor_kw',
        'motor_cv',
        'plazas',
        'nombre_comercial',
      ])
    )
    expect(mockDoc.mock.calls[0][1].archivo).toBe('permiso.jpg')
  })

  it('por debajo de 0,80 no escribe nada', async () => {
    conectar(
      [VACIO],
      [
        fichaDe({
          bastidor: campo('U5YPH81ADLL123456', 0.79),
          plazas: campo(5, 0.5),
        }),
      ]
    )
    const res = await POST(req())
    expect((await res.json()).rellenados).toBe(0)
    expect(mockFicha).not.toHaveBeenCalled()
    expect(mockDoc).not.toHaveBeenCalled()
  })

  it('NUNCA pisa un valor que el CRM ya tiene, aunque la confianza sea 1', async () => {
    conectar(
      [
        {
          ...VACIO,
          bastidor: 'OTRO12345678901234',
          plazas: 7,
          cubicaje: 1998,
        },
      ],
      [
        fichaDe({
          bastidor: campo('U5YPH81ADLL123456', 1),
          plazas: campo(5, 1),
          cilindrada_cc: campo(1598, 1),
        }),
      ]
    )
    const res = await POST(req())
    expect((await res.json()).rellenados).toBe(0)
    expect(mockFicha).not.toHaveBeenCalled()
    expect(mockDoc).not.toHaveBeenCalled()
  })

  it('rellena también coches sin publicar: si no, nunca podrían publicarse', async () => {
    conectar(
      [{ ...VACIO, estado: 'REVI_INIC' }],
      [fichaDe({ plazas: campo(5, 0.95) })]
    )
    const res = await POST(req())
    const json = await res.json()
    expect(json.publicados).toBe(0)
    expect(json.rellenados).toBe(1)
  })

  it('un coche sin publicar no ensucia la bandeja de revisión', async () => {
    conectar(
      [{ ...VACIO, estado: 'REVI_INIC', color: 'Gris' }],
      [
        // conflicto de color: no se puede arreglar solo
        fichaDe({ color: campo('Blanco', 1) }),
      ]
    )
    const res = await POST(req())
    const json = await res.json()
    expect(json.revisionCrm).toBe(0)
    expect(json.rellenados).toBe(0)
  })

  it('el mismo conflicto en un coche publicado sí va a la bandeja', async () => {
    conectar(
      [{ ...VACIO, estado: 'PUBLICADO', color: 'Gris' }],
      [fichaDe({ color: campo('Blanco', 1) })]
    )
    const res = await POST(req())
    const json = await res.json()
    expect(json.publicados).toBe(1)
    expect(json.revisionCrm).toBe(1)
  })

  it('los VENDIDOS ni se leen', async () => {
    conectar([], [])
    await POST(req())
    const sql = mockQuery.mock.calls.find((c: [string]) =>
      String(c[0]).includes('FROM "Vehiculo" v')
    )
    expect(sql[0]).toContain("<> 'VENDIDO'")
  })
})

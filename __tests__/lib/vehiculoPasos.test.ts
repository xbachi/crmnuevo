/**
 * @jest-environment node
 */
jest.mock('@/lib/direct-database', () => ({
  pool: { query: jest.fn() },
}))

import { pool } from '@/lib/direct-database'
import {
  esPasoVehiculo,
  getPasos,
  registrarPasoEstado,
  upsertPasos,
} from '@/lib/vehiculoPasos'

const mockQuery = pool.query as jest.Mock

beforeEach(() => {
  mockQuery.mockReset()
  mockQuery.mockResolvedValue({ rows: [] })
})

describe('esPasoVehiculo', () => {
  it('sólo los 7 pasos de preparación', () => {
    expect(esPasoVehiculo('REVI_INIC')).toBe(true)
    expect(esPasoVehiculo('PUBLICADO')).toBe(true)
    expect(esPasoVehiculo('CARPETA')).toBe(false)
    expect(esPasoVehiculo('VENDIDO')).toBe(false)
    expect(esPasoVehiculo(null)).toBe(false)
  })
})

describe('registrarPasoEstado', () => {
  it('estado que no es paso → no consulta y devuelve false', async () => {
    expect(await registrarPasoEstado(1, 'reservado')).toBe(false)
    expect(await registrarPasoEstado(1, 'VENDIDO')).toBe(false)
    expect(await registrarPasoEstado(1, null)).toBe(false)
    expect(mockQuery).not.toHaveBeenCalled()
  })

  it('estado de preparación → upsert con fecha de hoy y texto dd/mm', async () => {
    const hoy = new Date('2026-09-14T10:00:00Z')
    expect(await registrarPasoEstado(7, 'revi_inic', hoy)).toBe(true)
    expect(mockQuery).toHaveBeenCalledTimes(1)
    const [sql, params] = mockQuery.mock.calls[0]
    expect(sql).toMatch(/INSERT INTO vehiculo_pasos/)
    expect(sql).toMatch(/ON CONFLICT \(vehiculo_id, paso\)/)
    // Nunca pisa un texto existente (kanban o import), sólo rellena.
    expect(sql).toMatch(
      /texto = COALESCE\(NULLIF\(vehiculo_pasos\.texto, ''\), EXCLUDED\.texto\)/
    )
    expect(params).toEqual([7, 'REVI_INIC', '14/09', '2026-09-14'])
  })

  it('error de DB → false, no lanza', async () => {
    mockQuery.mockRejectedValueOnce(new Error('boom'))
    const spy = jest.spyOn(console, 'error').mockImplementation(() => {})
    expect(await registrarPasoEstado(1, 'MECAUTO')).toBe(false)
    spy.mockRestore()
  })
})

describe('getPasos / upsertPasos', () => {
  it('getPasos devuelve en el orden del checklist con fecha YMD', async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [
        {
          paso: 'FOTOS',
          texto: '1/6',
          fecha: new Date('2026-06-01T00:00:00Z'),
          fuente: 'import',
        },
        { paso: 'REVI_INIC', texto: null, fecha: null, fuente: 'crm' },
      ],
    })
    const pasos = await getPasos(3)
    expect(pasos.map((p) => p.paso)).toEqual(['REVI_INIC', 'FOTOS'])
    expect(pasos[1].fecha).toBe('2026-06-01')
  })

  it('upsertPasos ignora pasos inválidos y fechas no YMD', async () => {
    await upsertPasos(3, [
      { paso: 'PINTURA', texto: ' sin pintar ', fecha: '24/3' },
      { paso: 'CARPETA' as never, texto: 'x' },
    ])
    expect(mockQuery).toHaveBeenCalledTimes(1)
    expect(mockQuery.mock.calls[0][1]).toEqual([
      3,
      'PINTURA',
      'sin pintar',
      null,
      'crm',
    ])
  })
})

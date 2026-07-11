/**
 * @jest-environment node
 *
 * periodoLock — cierre mensual. Un mes cerrado bloquea; la tabla inexistente
 * (migración pendiente) NO bloquea; el error es tipado (PeriodoCerradoError).
 */

import type { Pool } from 'pg'
import {
  esPeriodoCerrado,
  assertPeriodoAbierto,
  periodoDe,
  PeriodoCerradoError,
} from '@/lib/periodoLock'

function fakeDb(handlers: Array<[string, unknown]>) {
  const query = jest.fn(async (sql: string) => {
    for (const [match, result] of handlers) {
      if (sql.includes(match)) return result
    }
    throw new Error(`SQL inesperado en test: ${sql}`)
  })
  return { db: { query } as unknown as Pool, query }
}

describe('periodoDe', () => {
  it('parsea fecha ISO string y Date', () => {
    expect(periodoDe('2026-04-15')).toEqual({ anio: 2026, mes: 4 })
    expect(periodoDe(new Date(2026, 3, 15))).toEqual({ anio: 2026, mes: 4 })
  })

  it('devuelve null para fechas no parseables', () => {
    expect(periodoDe(null)).toBeNull()
    expect(periodoDe('')).toBeNull()
    expect(periodoDe('basura')).toBeNull()
    expect(periodoDe('2026-13-01')).toBeNull()
    expect(periodoDe(new Date('invalid'))).toBeNull()
  })
})

describe('esPeriodoCerrado', () => {
  it('período cerrado → true', async () => {
    const { db } = fakeDb([
      ['to_regclass', { rows: [{ t: 'periodos_contables' }] }],
      ['FROM periodos_contables', { rows: [{ '?column?': 1 }] }],
    ])
    await expect(esPeriodoCerrado(db, '2026-04-15')).resolves.toBe(true)
  })

  it('período abierto (sin fila cerrada) → false', async () => {
    const { db } = fakeDb([
      ['to_regclass', { rows: [{ t: 'periodos_contables' }] }],
      ['FROM periodos_contables', { rows: [] }],
    ])
    await expect(esPeriodoCerrado(db, '2026-04-15')).resolves.toBe(false)
  })

  it('tabla inexistente (migración pendiente) → false, sin consultar la tabla', async () => {
    const { db, query } = fakeDb([['to_regclass', { rows: [{ t: null }] }]])
    await expect(esPeriodoCerrado(db, '2026-04-15')).resolves.toBe(false)
    expect(query).toHaveBeenCalledTimes(1)
  })

  it('fecha no parseable → false, sin tocar la DB', async () => {
    const { db, query } = fakeDb([])
    await expect(esPeriodoCerrado(db, null)).resolves.toBe(false)
    await expect(esPeriodoCerrado(db, 'basura')).resolves.toBe(false)
    expect(query).not.toHaveBeenCalled()
  })
})

describe('assertPeriodoAbierto', () => {
  it('cerrado → lanza PeriodoCerradoError tipado con mensaje claro', async () => {
    const { db } = fakeDb([
      ['to_regclass', { rows: [{ t: 'periodos_contables' }] }],
      ['FROM periodos_contables', { rows: [{ '?column?': 1 }] }],
    ])
    const p = assertPeriodoAbierto(db, '2026-04-15', 'No se puede emitir la factura')
    await expect(p).rejects.toBeInstanceOf(PeriodoCerradoError)
    try {
      await assertPeriodoAbierto(db, '2026-04-15', 'No se puede emitir la factura')
    } catch (err) {
      const e = err as PeriodoCerradoError
      expect(e.anio).toBe(2026)
      expect(e.mes).toBe(4)
      expect(e.message).toContain('2026-04')
      expect(e.message).toContain('cerrado')
      expect(e.message).toContain('/api/admin/periodos')
    }
  })

  it('abierto → no lanza', async () => {
    const { db } = fakeDb([
      ['to_regclass', { rows: [{ t: 'periodos_contables' }] }],
      ['FROM periodos_contables', { rows: [] }],
    ])
    await expect(assertPeriodoAbierto(db, '2026-04-15')).resolves.toBeUndefined()
  })
})

/**
 * @jest-environment node
 *
 * fiscalAudit — diff de campos (sin cambios fantasma por NUMERIC-as-string),
 * guarda de inmutabilidad y no-op cuando la migración está pendiente.
 */

import type { Pool } from 'pg'
import {
  diffCampos,
  registrarCambio,
  assertRegistroMutable,
  RegistroInmutableError,
} from '@/lib/fiscalAudit'

function fakeDb(handlers: Array<[string, unknown]>) {
  const query = jest.fn(async (sql: string) => {
    for (const [match, result] of handlers) {
      if (sql.includes(match)) return result
    }
    throw new Error(`SQL inesperado en test: ${sql}`)
  })
  return { db: { query } as unknown as Pool, query }
}

describe('diffCampos', () => {
  it('solo devuelve los campos que cambiaron', () => {
    const d = diffCampos(
      { total: 100, serie: 'R', estado: 'emitida' },
      { total: 120, serie: 'R', estado: 'emitida' }
    )
    expect(d).toEqual({ total: { antes: 100, despues: 120 } })
  })

  it('sin cambios → objeto vacío', () => {
    expect(diffCampos({ a: 1, b: 'x' }, { a: 1, b: 'x' })).toEqual({})
  })

  it('NUMERIC de pg ("12.50" string) vs 12.5 number NO es un cambio', () => {
    expect(diffCampos({ total: '12.50' }, { total: 12.5 })).toEqual({})
    expect(diffCampos({ total: 12.5 }, { total: '12.50' })).toEqual({})
    expect(diffCampos({ total: '1000' }, { total: 1000 })).toEqual({})
    expect(diffCampos({ total: '0.00' }, { total: 0 })).toEqual({})
  })

  it('pero un importe realmente distinto SÍ es un cambio', () => {
    expect(diffCampos({ total: '12.50' }, { total: 12.6 })).toEqual({
      total: { antes: '12.50', despues: 12.6 },
    })
  })

  it('Date vs su ISO string NO es un cambio', () => {
    const d = new Date('2026-04-15T10:30:00.000Z')
    expect(diffCampos({ fecha: d }, { fecha: '2026-04-15T10:30:00.000Z' })).toEqual({})
    expect(diffCampos({ fecha: '2026-04-15T10:30:00.000Z' }, { fecha: d })).toEqual({})
  })

  it('fechas distintas SÍ son un cambio', () => {
    const d = new Date('2026-04-15T10:30:00.000Z')
    expect(Object.keys(diffCampos({ fecha: d }, { fecha: '2026-04-16T10:30:00.000Z' }))).toEqual([
      'fecha',
    ])
  })

  it('no confunde texto que solo parece numérico', () => {
    expect(Object.keys(diffCampos({ matricula: '1234ABC' }, { matricula: '1234abc' }))).toEqual([
      'matricula',
    ])
    expect(diffCampos({ ref: '007' }, { ref: '007' })).toEqual({})
  })

  it('undefined en despues se ignora (campo no enviado ≠ campo borrado)', () => {
    expect(diffCampos({ nif: 'B75939868' }, { nif: undefined })).toEqual({})
    expect(diffCampos({ nif: 'B75939868', total: 100 }, { nif: undefined, total: 120 })).toEqual({
      total: { antes: 100, despues: 120 },
    })
  })

  it('null → valor SÍ es un cambio (alta de dato)', () => {
    expect(diffCampos({ nif: null }, { nif: 'B75939868' })).toEqual({
      nif: { antes: null, despues: 'B75939868' },
    })
  })

  it('valor → null SÍ es un cambio (borrado explícito)', () => {
    expect(diffCampos({ nif: 'B75939868' }, { nif: null })).toEqual({
      nif: { antes: 'B75939868', despues: null },
    })
  })

  it('campo ausente en antes → cambio con antes null', () => {
    expect(diffCampos({}, { nif: 'B75939868' })).toEqual({
      nif: { antes: null, despues: 'B75939868' },
    })
  })

  it('null y undefined en antes se normalizan igual', () => {
    expect(diffCampos({ nif: null }, { nif: null })).toEqual({})
    expect(diffCampos({ nif: undefined }, { nif: null })).toEqual({})
  })

  it('compara objetos/arrays por valor', () => {
    expect(diffCampos({ meta: { a: 1 } }, { meta: { a: 1 } })).toEqual({})
    expect(Object.keys(diffCampos({ meta: { a: 1 } }, { meta: { a: 2 } }))).toEqual(['meta'])
  })

  it('booleanos', () => {
    expect(diffCampos({ pagada: false }, { pagada: true })).toEqual({
      pagada: { antes: false, despues: true },
    })
    expect(diffCampos({ pagada: true }, { pagada: true })).toEqual({})
  })
})

describe('registrarCambio', () => {
  const params = {
    tabla: 'invoices',
    filaId: 42,
    accion: 'editar' as const,
    cambios: { total: { antes: 100, despues: 120 } },
    actor: 'seb',
  }

  it('tabla inexistente (migración pendiente) → no-op, sin INSERT', async () => {
    const { db, query } = fakeDb([['to_regclass', { rows: [{ t: null }] }]])
    await expect(registrarCambio(db, params)).resolves.toBeUndefined()
    expect(query).toHaveBeenCalledTimes(1)
  })

  it('tabla existente → INSERT con los parámetros correctos', async () => {
    const { db, query } = fakeDb([
      ['to_regclass', { rows: [{ t: 'fiscal_audit_log' }] }],
      ['INSERT INTO fiscal_audit_log', { rows: [] }],
    ])
    await registrarCambio(db, { ...params, motivo: 'importe mal tecleado' })
    expect(query).toHaveBeenCalledTimes(2)

    const [sql, values] = query.mock.calls[1] as unknown as [string, unknown[]]
    expect(sql).toContain('INSERT INTO fiscal_audit_log')
    expect(values).toEqual([
      'invoices',
      42,
      'editar',
      JSON.stringify(params.cambios),
      'importe mal tecleado',
      'seb',
    ])
  })

  it('sin motivo → null (no undefined, que pg rechaza)', async () => {
    const { db, query } = fakeDb([
      ['to_regclass', { rows: [{ t: 'fiscal_audit_log' }] }],
      ['INSERT INTO fiscal_audit_log', { rows: [] }],
    ])
    await registrarCambio(db, params)
    const [, values] = query.mock.calls[1] as unknown as [string, unknown[]]
    expect(values[4]).toBeNull()
  })
})

describe('assertRegistroMutable', () => {
  it('estado normal → no lanza', () => {
    expect(() => assertRegistroMutable({ estado: 'emitida' })).not.toThrow()
    expect(() => assertRegistroMutable({ estado: 'borrador' })).not.toThrow()
    expect(() => assertRegistroMutable({ estado: null })).not.toThrow()
    expect(() => assertRegistroMutable({})).not.toThrow()
  })

  it('declarada sin force → lanza RegistroInmutableError en español', () => {
    expect(() => assertRegistroMutable({ estado: 'declarada' })).toThrow(RegistroInmutableError)
    try {
      assertRegistroMutable({ estado: 'declarada' })
    } catch (err) {
      const e = err as RegistroInmutableError
      expect(e.name).toBe('RegistroInmutableError')
      expect(e.estado).toBe('declarada')
      expect(e.message).toContain('declarada')
      expect(e.message).toContain('motivo')
      expect(e.message).toContain('correccion-post-declaracion')
    }
  })

  it('declarada con force + motivo → pasa', () => {
    expect(() =>
      assertRegistroMutable({ estado: 'declarada' }, { force: true, motivo: 'error de importe detectado por la gestoría' })
    ).not.toThrow()
  })

  it('force SIN motivo → lanza (el motivo es lo que justifica la corrección)', () => {
    expect(() => assertRegistroMutable({ estado: 'declarada' }, { force: true })).toThrow(
      RegistroInmutableError
    )
    expect(() => assertRegistroMutable({ estado: 'declarada' }, { force: true, motivo: '' })).toThrow(
      RegistroInmutableError
    )
    expect(() =>
      assertRegistroMutable({ estado: 'declarada' }, { force: true, motivo: '   ' })
    ).toThrow(RegistroInmutableError)
  })

  it('motivo SIN force → lanza', () => {
    expect(() => assertRegistroMutable({ estado: 'declarada' }, { motivo: 'algo' })).toThrow(
      RegistroInmutableError
    )
  })

  it('rectificada y anulada reciben el mismo trato', () => {
    expect(() => assertRegistroMutable({ estado: 'rectificada' })).toThrow(RegistroInmutableError)
    expect(() => assertRegistroMutable({ estado: 'anulada' })).toThrow(RegistroInmutableError)
    expect(() =>
      assertRegistroMutable({ estado: 'anulada' }, { force: true, motivo: 'corrección puntual' })
    ).not.toThrow()
  })

  it('el estado se compara sin importar mayúsculas', () => {
    expect(() => assertRegistroMutable({ estado: 'DECLARADA' })).toThrow(RegistroInmutableError)
  })
})

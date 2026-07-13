/**
 * Alias de matrícula: el BMW M2 (id 398) se vendió con la provisional 5732BDR
 * y la DGT le dio la definitiva 5439NNW. Las dos son el MISMO coche; dos coches
 * distintos NUNCA se unen.
 */

import type { Pool } from 'pg'
import {
  construirAliasIndex,
  canonPlate,
  resolverAliasMatricula,
  mismoVehiculo,
  aliasDeMatricula,
  cargarAliasIndex,
  ALIAS_VACIO,
} from '@/lib/aliasMatriculas'

const M2 = { vehiculoId: 398, matriculas: ['5439NNW', '5732BDR'] }
const OTRO = { vehiculoId: 12, matriculas: ['0608NLF'] }

describe('construirAliasIndex', () => {
  it('la provisional y la definitiva resuelven al mismo coche', () => {
    const idx = construirAliasIndex([M2, OTRO])
    expect(canonPlate(idx, '5732BDR')).toBe(canonPlate(idx, '5439NNW'))
    expect(mismoVehiculo(idx, '5732 BDR', '5439-nnw')).toBe(true)
    expect(resolverAliasMatricula(idx, '5732BDR').sort()).toEqual(['5439NNW', '5732BDR'])
  })

  it('no une dos coches distintos', () => {
    const idx = construirAliasIndex([M2, OTRO])
    expect(mismoVehiculo(idx, '5439NNW', '0608NLF')).toBe(false)
    expect(canonPlate(idx, '0608NLF')).toBe('0608NLF')
    expect(resolverAliasMatricula(idx, '0608NLF')).toEqual(['0608NLF'])
  })

  it('una matrícula reclamada por dos vehículos es ambigua: no se aliasa', () => {
    const idx = construirAliasIndex([
      { vehiculoId: 1, matriculas: ['1111AAA', '2222BBB'] },
      { vehiculoId: 2, matriculas: ['2222BBB', '3333CCC'] },
    ])
    // 2222BBB es ambigua → cada coche queda con sus propias matrículas limpias
    expect(mismoVehiculo(idx, '1111AAA', '3333CCC')).toBe(false)
    expect(canonPlate(idx, '2222BBB')).toBe('2222BBB')
    expect(resolverAliasMatricula(idx, '2222BBB')).toEqual(['2222BBB'])
  })

  it('sin índice se comporta como normPlate', () => {
    expect(canonPlate(ALIAS_VACIO, '5732 bdr')).toBe('5732BDR')
    expect(canonPlate(null, '5732-BDR')).toBe('5732BDR')
    expect(mismoVehiculo(null, '5732BDR', '5439NNW')).toBe(false)
  })
})

function makeDb(handlers: Array<[string, unknown]>) {
  const query = jest.fn(async (sql: string) => {
    for (const [match, result] of handlers) {
      if (sql.includes(match)) return result
    }
    return { rows: [], rowCount: 0 }
  })
  return { db: { query } as unknown as Pool, query }
}

describe('carga desde DB', () => {
  it('cargarAliasIndex devuelve vacío si la tabla no existe', async () => {
    const { db } = makeDb([["to_regclass('public.vehiculo_matriculas')", { rows: [{ reg: null }] }]])
    const idx = await cargarAliasIndex(db)
    expect(idx.canon.size).toBe(0)
  })

  it('cargarAliasIndex arma el grupo del coche', async () => {
    const { db } = makeDb([
      ["to_regclass('public.vehiculo_matriculas')", { rows: [{ reg: 'vehiculo_matriculas' }] }],
      ['GROUP BY vehiculo_id', { rows: [{ vehiculo_id: 398, matriculas: ['5439NNW', '5732BDR'] }] }],
    ])
    const idx = await cargarAliasIndex(db)
    expect(mismoVehiculo(idx, '5732BDR', '5439NNW')).toBe(true)
  })

  it('aliasDeMatricula devuelve la propia si la tabla no existe', async () => {
    const { db } = makeDb([["to_regclass('public.vehiculo_matriculas')", { rows: [{ reg: null }] }]])
    expect(await aliasDeMatricula(db, '5439 nnw')).toEqual(['5439NNW'])
  })

  it('aliasDeMatricula trae las dos matrículas del coche', async () => {
    const { db } = makeDb([
      ["to_regclass('public.vehiculo_matriculas')", { rows: [{ reg: 'vehiculo_matriculas' }] }],
      [
        'JOIN vehiculo_matriculas m2',
        {
          rows: [
            { matricula_norm: '5439NNW', vehiculo_id: 398 },
            { matricula_norm: '5732BDR', vehiculo_id: 398 },
          ],
        },
      ],
    ])
    expect(await aliasDeMatricula(db, '5439NNW')).toEqual(['5439NNW', '5732BDR'])
  })

  it('aliasDeMatricula NO aliasa si la matrícula figura en dos vehículos', async () => {
    const { db } = makeDb([
      ["to_regclass('public.vehiculo_matriculas')", { rows: [{ reg: 'vehiculo_matriculas' }] }],
      [
        'JOIN vehiculo_matriculas m2',
        {
          rows: [
            { matricula_norm: '2222BBB', vehiculo_id: 1 },
            { matricula_norm: '1111AAA', vehiculo_id: 1 },
            { matricula_norm: '2222BBB', vehiculo_id: 2 },
          ],
        },
      ],
    ])
    expect(await aliasDeMatricula(db, '2222BBB')).toEqual(['2222BBB'])
  })
})

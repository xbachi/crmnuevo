jest.mock('@/lib/direct-database', () => ({ pool: {} }))
jest.mock('@/lib/googleSheets', () => ({ getGoogleSheetsAuth: jest.fn() }))
jest.mock('googleapis', () => ({ google: { sheets: jest.fn() } }))

import { expandRangesInFormula } from '@/lib/costoBeneficio'

describe('expandRangesInFormula', () => {
  it('expande rangos que terminan en la última fila del bloque', () => {
    expect(expandRangesInFormula('=SUM(C10:C20)', 20, 2)).toBe('=SUM(C10:C22)')
    expect(expandRangesInFormula('=SUMA(I5:I20)+K3', 20, 2)).toBe('=SUMA(I5:I22)+K3')
  })

  it('no toca rangos que terminan en otras filas', () => {
    expect(expandRangesInFormula('=SUM(C10:C19)', 20, 2)).toBe('=SUM(C10:C19)')
    expect(expandRangesInFormula('=C21-I21', 20, 2)).toBe('=C21-I21')
  })

  it('respeta referencias absolutas', () => {
    expect(expandRangesInFormula('=SUM($C$10:$C$20)', 20, 2)).toBe('=SUM($C$10:$C$22)')
  })

  it('expande varios rangos en la misma fórmula', () => {
    expect(expandRangesInFormula('=SUM(C10:C20)-SUM(K10:K20)', 20, 2)).toBe(
      '=SUM(C10:C22)-SUM(K10:K22)'
    )
  })

  it('no confunde filas con el mismo sufijo numérico', () => {
    // termina en 120, no en 20
    expect(expandRangesInFormula('=SUM(C100:C120)', 20, 2)).toBe('=SUM(C100:C120)')
  })
})

import { interpretarFechaCorta } from '@/lib/fechaCorta'

// "Hoy" fijo para que "dd/mm" sin año sea determinista.
const HOY = new Date('2026-09-14T12:00:00Z')

describe('interpretarFechaCorta', () => {
  it.each([
    ['24/3', 2026, '2026-03-24'],
    ['1/6', 2026, '2026-06-01'],
    ['06/03/26', 2026, '2026-03-06'],
    ['06/03/2026', 2026, '2026-03-06'],
    ['17072026', 2026, '2026-07-17'],
    ['06/03/26// 10/03', 2026, '2026-03-06'],
    ['24/3 // 30/3', 2026, '2026-03-24'],
    ['nov/25', 2026, '2025-11-01'],
    ['NOV 25', 2026, '2025-11-01'],
    ['sept/2025', 2026, '2025-09-01'],
    ['25/10/2002', 2026, '2002-10-25'],
    ['02/03/2026', 2026, '2026-03-02'],
  ])('%s (ref %i) → %s', (texto, ref, esperado) => {
    expect(interpretarFechaCorta(texto, ref, HOY)).toBe(esperado)
  })

  it('dd/mm futuro respecto a hoy → año anterior', () => {
    expect(interpretarFechaCorta('20/12', 2026, HOY)).toBe('2025-12-20')
    expect(interpretarFechaCorta('14/9', 2026, HOY)).toBe('2026-09-14')
  })

  it('sin año de referencia usa el actual', () => {
    expect(interpretarFechaCorta('1/1', undefined, HOY)).toBe(
      `${HOY.getUTCFullYear()}-01-01`
    )
  })

  it.each([
    'SI',
    'NO',
    'SÍ',
    'no fue',
    'sin pintar',
    'FALTA HACER',
    'SOLICITADO 7/7',
    '5-9 fergo',
    '15-7 quads',
    '31/2',
    '32/01/2026',
    '',
    '   ',
    'xyz/25',
  ])('%p → null', (texto) => {
    expect(interpretarFechaCorta(texto, 2026, HOY)).toBeNull()
  })

  it('entrada no string → null, nunca lanza', () => {
    expect(interpretarFechaCorta(null, 2026)).toBeNull()
    expect(interpretarFechaCorta(undefined, 2026)).toBeNull()
    expect(interpretarFechaCorta(42, 2026)).toBeNull()
    expect(interpretarFechaCorta({}, 2026)).toBeNull()
  })
})

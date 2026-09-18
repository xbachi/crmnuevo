/**
 * @jest-environment node
 *
 * Sufijo -Alemania del nombre de carpeta: sólo con matrículas realmente
 * extranjeras. Una errata de un carácter en un alias no cuenta (pasó con el
 * Kia Sportage 3429LHT, cuyo alias 34529LHT inventaba un '-Alemania').
 */
/* eslint-disable @typescript-eslint/no-require-imports */
const {
  nombreCarpetaCanonico,
  esErrata,
} = require('../../scripts/lib/carpetaNombre.js')

const base = {
  referencia: '#1084',
  tipo: 'C',
  marca: 'kia',
  modelo: 'sportage',
  matriculaNorm: '3429LHT',
}

describe('nombreCarpetaCanonico: sufijo de matrícula extranjera', () => {
  it('un alias con una errata de tecleo no añade -Alemania', () => {
    expect(nombreCarpetaCanonico({ ...base, aliases: ['34529LHT'] })).toBe(
      '84-Kia-Sportage-3429LHT'
    )
  })

  it('un alias realmente extranjero sí lo añade', () => {
    expect(
      nombreCarpetaCanonico({
        referencia: '#1067',
        tipo: 'C',
        marca: 'Mazda',
        modelo: 'CX5',
        matriculaNorm: '4994NLH',
        aliases: ['MZKF6W1A9'],
      })
    ).toBe('67-Mazda-CX5-4994NLH-Alemania')
  })

  it('si la matrícula actual no es española, el sufijo se mantiene', () => {
    expect(
      nombreCarpetaCanonico({
        referencia: '#1070',
        tipo: 'C',
        marca: 'Hyundai',
        modelo: 'i10',
        matriculaNorm: 'ALEMANA',
        aliases: [],
      })
    ).toBe('70-Hyundai-I10-ALEMANA-Alemania')
  })

  it('sin alias, nombre limpio', () => {
    expect(nombreCarpetaCanonico({ ...base, aliases: [] })).toBe(
      '84-Kia-Sportage-3429LHT'
    )
  })
})

describe('esErrata', () => {
  it.each([
    ['3429LHT', '34529LHT', true],
    ['3429LHT', '3429LHT', true],
    ['3429LHT', '3429LHX', true],
    ['3429LHT', '9999XXX', false],
    ['3429LHT', '', false],
  ])('%s vs %s → %s', (a, b, esperado) => {
    expect(esErrata(a, b)).toBe(esperado)
  })
})

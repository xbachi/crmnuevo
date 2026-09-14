import {
  normalizarReferencia,
  normalizarMatricula,
  extraerMatriculaEntrada,
  validarMatricula,
  refCarpeta,
} from '@/lib/normalizacion'

describe('normalizarReferencia', () => {
  it.each([
    ['#1088', undefined, '#1088'],
    ['1088', 'C', '#1088'],
    ['# 1088', undefined, '#1088'],
    ['1.088', undefined, '#1088'],
    ['#1073 ', undefined, '#1073'],
    ['1065', 'I', '#1065'],
    ['#D-28', undefined, '#D-28'],
    ['D-28', undefined, '#D-28'],
    ['D28', undefined, '#D-28'],
    ['d-28', undefined, '#D-28'],
    ['#D 28', undefined, '#D-28'],
    ['C-2', undefined, '#D-02'],
    ['#R-11', undefined, '#R-11'],
    ['R-11', undefined, '#R-11'],
    ['r11', undefined, '#R-11'],
    ['R-1', undefined, '#R-01'],
    ['28', 'D', '#D-28'],
    ['28', 'Deposito Venta', '#D-28'],
    ['11', 'R', '#R-11'],
    ['11', 'Coche R', '#R-11'],
    ['D-28', 'R', '#D-28'],
    ['#1038', 'Deposito Venta', '#1038'],
    ['1038', 'R', '#1038'],
    ['I-1088', 'I', '#1088'],
    ['#I-1065', undefined, '#1065'],
    ['i1065', 'Inversor', '#1065'],
    ['1088', 'Compra', '#1088'],
    ['1088', 'M', '#1088'],
    ['1088', undefined, '#1088'],
  ])('%p con tipo %p → %p', (input, tipo, esperado) => {
    expect(normalizarReferencia(input, tipo)).toBe(esperado)
  })

  it.each(['', null, 'SI', 'REFERENCIA', 'MAN-E9961BDJ-15169'])(
    '%p → null',
    (input) => {
      expect(normalizarReferencia(input)).toBeNull()
    }
  )
})

describe('normalizarMatricula', () => {
  it.each([
    ['8061 KRN', '8061KRN'],
    ['6015hbn', '6015HBN'],
    ['V-4892-GT', 'V4892GT'],
    ['1.234.abc', '1234ABC'],
    [' 9500   kbd ', '9500KBD'],
    ['Alemana/4994NLH', 'ALEMANA/4994NLH'],
    [null, ''],
    [undefined, ''],
  ])('%p → %p', (input, esperado) => {
    expect(normalizarMatricula(input)).toBe(esperado)
  })
})

describe('extraerMatriculaEntrada', () => {
  it.each([
    ['Alemana/4994NLH', '4994NLH'],
    ['alemania/xx', 'ALEMANIA/XX'],
    ['8061 KRN', '8061KRN'],
  ])('%p → %p', (input, esperado) => {
    expect(extraerMatriculaEntrada(input)).toBe(esperado)
  })
})

describe('validarMatricula', () => {
  it.each(['8061KRN', '0110LMK', '7081KMX'])('%p es actual', (m) => {
    expect(validarMatricula(m)).toEqual({ ok: true, formato: 'actual' })
  })

  it('V4892GT es provincial', () => {
    expect(validarMatricula('V4892GT')).toEqual({
      ok: true,
      formato: 'provincial',
    })
  })

  it.each(['8134LLTP', 'LMM', 'MGV', 'ALEMANIA', 'ALEMANA', '', '1234ABC'])(
    '%p es inválida',
    (m) => {
      expect(validarMatricula(m)).toEqual({ ok: false, formato: 'invalida' })
    }
  )

  it('extranjera sólo con la opción y cadena no vacía', () => {
    expect(validarMatricula('ALEMANA', { extranjera: true })).toEqual({
      ok: true,
      formato: 'extranjera',
    })
    expect(validarMatricula('8061KRN', { extranjera: true })).toEqual({
      ok: true,
      formato: 'actual',
    })
    expect(validarMatricula('', { extranjera: true })).toEqual({
      ok: false,
      formato: 'invalida',
    })
  })
})

describe('refCarpeta', () => {
  it.each([
    ['#1088', undefined, '88'],
    ['1088', undefined, '88'],
    ['#1001', undefined, '01'],
    ['#1001', { pad: false }, '1'],
    ['#1005', { pad: false }, '5'],
    ['#1150', undefined, '150'],
    ['#1100', undefined, '100'],
    ['#D-28', undefined, 'D-28'],
    ['D28', undefined, 'D-28'],
    ['#D-02', undefined, 'D-02'],
    ['#D-02', { pad: false }, 'D-2'],
    ['#R-11', undefined, 'R-11'],
    ['#999', undefined, null],
    ['#1200', undefined, null],
    ['MAN-E9961BDJ-15169', undefined, null],
    [null, undefined, null],
    ['#1038', { tipo: 'D' }, 'D-38'],
    ['#1038', { tipo: 'Deposito Venta', pad: false }, 'D-38'],
    ['#1005', { tipo: 'R' }, 'R-05'],
    ['#1005', { tipo: 'R', pad: false }, 'R-5'],
    ['#1088', { tipo: 'C' }, '88'],
    ['#D-28', { tipo: 'C' }, 'D-28'],
    ['#1250', { tipo: 'D' }, null],
    ['#I-1088', { tipo: 'I' }, '88'],
  ])('%p %p → %p', (ref, opts, esperado) => {
    expect(refCarpeta(ref, opts)).toBe(esperado)
  })
})

/**
 * nifValidator — control de DNI/NIE/CIF y formato de NIF-IVA intracomunitario.
 *
 * Casos reales del CRM: B75939868 (SevenCars, hardcodeado en facturacionRegistro)
 * y DE123456789 (forma del NIF-IVA de ALD/Ayvens).
 */

import {
  normalizarNif,
  validarDNI,
  validarNIE,
  validarCIF,
  validarNifIvaUE,
  validarNif,
} from '@/lib/nifValidator'

describe('normalizarNif', () => {
  it('mayúsculas y sin espacios, guiones ni puntos', () => {
    expect(normalizarNif(' 12345678-z ')).toBe('12345678Z')
    expect(normalizarNif('b-75.939.868')).toBe('B75939868')
    expect(normalizarNif('x 1234567 l')).toBe('X1234567L')
  })

  it('entrada vacía → cadena vacía', () => {
    expect(normalizarNif('')).toBe('')
    expect(normalizarNif('   ')).toBe('')
  })
})

describe('validarDNI', () => {
  it('acepta DNIs con letra de control correcta', () => {
    expect(validarDNI('12345678Z')).toBe(true)
    expect(validarDNI('00000000T')).toBe(true)
    expect(validarDNI('99999999R')).toBe(true)
  })

  it('rechaza letra de control incorrecta', () => {
    expect(validarDNI('12345678A')).toBe(false)
    expect(validarDNI('00000000A')).toBe(false)
  })

  it('normaliza antes de validar (minúsculas, guiones, espacios)', () => {
    expect(validarDNI('12345678z')).toBe(true)
    expect(validarDNI('12345678-Z')).toBe(true)
    expect(validarDNI(' 12345678 Z ')).toBe(true)
  })

  it('rechaza formas que no son DNI', () => {
    expect(validarDNI('1234567Z')).toBe(false) // 7 dígitos
    expect(validarDNI('123456789Z')).toBe(false) // 9 dígitos
    expect(validarDNI('12345678')).toBe(false) // sin letra
    expect(validarDNI('X1234567L')).toBe(false) // es un NIE
    expect(validarDNI('basura')).toBe(false)
  })
})

describe('validarNIE', () => {
  it('acepta NIEs válidos de las tres iniciales', () => {
    expect(validarNIE('X1234567L')).toBe(true)
    expect(validarNIE('Y1234567X')).toBe(true)
    expect(validarNIE('Z1234567R')).toBe(true)
  })

  it('rechaza letra de control incorrecta', () => {
    expect(validarNIE('X1234567A')).toBe(false)
    expect(validarNIE('Y1234567L')).toBe(false) // la L es la de la X, no la de la Y
  })

  it('rechaza inicial no NIE y formatos raros', () => {
    expect(validarNIE('W1234567L')).toBe(false)
    expect(validarNIE('X123456L')).toBe(false)
    expect(validarNIE('12345678Z')).toBe(false)
  })

  it('normaliza antes de validar', () => {
    expect(validarNIE('x-1234567-l')).toBe(true)
  })
})

describe('validarCIF', () => {
  it('control NUMÉRICO (A,B,E,H)', () => {
    expect(validarCIF('A58818501')).toBe(true)
    expect(validarCIF('B75939868')).toBe(true) // NIF real de SevenCars
    expect(validarCIF('A58818500')).toBe(false)
    expect(validarCIF('B75939861')).toBe(false)
  })

  it('control NUMÉRICO no acepta la letra equivalente', () => {
    // A58818501 → control 1 → la letra equivalente sería 'A', pero la A exige dígito
    expect(validarCIF('A5881850A')).toBe(false)
  })

  it('control ALFABÉTICO (K,P,Q,R,S,N,W)', () => {
    expect(validarCIF('Q2826000H')).toBe(true)
    expect(validarCIF('Q2826000I')).toBe(false)
  })

  it('control ALFABÉTICO no acepta el dígito equivalente', () => {
    // Q2826000 → control 8 → 'H'; la Q exige letra
    expect(validarCIF('Q28260008')).toBe(false)
  })

  it('control AMBOS (C,D,F,G,J,L,M,U,V) acepta dígito o letra', () => {
    // J2826000 → mismos dígitos que el ejemplo Q → control 8 / 'H'
    expect(validarCIF('J28260008')).toBe(true)
    expect(validarCIF('J2826000H')).toBe(true)
    expect(validarCIF('J28260007')).toBe(false)
    expect(validarCIF('J2826000G')).toBe(false)
  })

  it('rechaza letra de entidad inexistente', () => {
    expect(validarCIF('I28260008')).toBe(false)
    expect(validarCIF('O28260008')).toBe(false)
    expect(validarCIF('T28260008')).toBe(false)
  })

  it('normaliza antes de validar', () => {
    expect(validarCIF('b-75.939.868')).toBe(true)
    expect(validarCIF(' b75939868 ')).toBe(true)
  })

  it('rechaza formatos que no son CIF', () => {
    expect(validarCIF('B7593986')).toBe(false) // corto
    expect(validarCIF('B759398688')).toBe(false) // largo
    expect(validarCIF('12345678Z')).toBe(false)
    expect(validarCIF('')).toBe(false)
  })
})

describe('validarNifIvaUE — solo formato, sin VIES', () => {
  it('acepta formatos válidos por país', () => {
    expect(validarNifIvaUE('DE123456789')).toBe(true) // forma del NIF-IVA de ALD/Ayvens
    expect(validarNifIvaUE('FRAB123456789')).toBe(true)
    expect(validarNifIvaUE('FR12123456789')).toBe(true)
    expect(validarNifIvaUE('IT12345678901')).toBe(true)
    expect(validarNifIvaUE('PT123456789')).toBe(true)
    expect(validarNifIvaUE('NL123456789B01')).toBe(true)
    expect(validarNifIvaUE('BE0123456789')).toBe(true)
    expect(validarNifIvaUE('BE123456789')).toBe(true)
    expect(validarNifIvaUE('ATU12345678')).toBe(true)
    expect(validarNifIvaUE('PL1234567890')).toBe(true)
    expect(validarNifIvaUE('IE1234567W')).toBe(true)
    expect(validarNifIvaUE('SE123456789012')).toBe(true)
    expect(validarNifIvaUE('DK12345678')).toBe(true)
    expect(validarNifIvaUE('LU12345678')).toBe(true)
  })

  it('normaliza antes de validar', () => {
    expect(validarNifIvaUE('de 123.456.789')).toBe(true)
  })

  it('rechaza longitud incorrecta', () => {
    expect(validarNifIvaUE('DE12345678')).toBe(false) // 8 dígitos
    expect(validarNifIvaUE('DE1234567890')).toBe(false) // 10 dígitos
    expect(validarNifIvaUE('ATU1234567')).toBe(false)
    expect(validarNifIvaUE('NL123456789X01')).toBe(false) // falta la B
  })

  it('rechaza país no mapeado y basura', () => {
    expect(validarNifIvaUE('XX123456789')).toBe(false)
    expect(validarNifIvaUE('US123456789')).toBe(false)
    expect(validarNifIvaUE('123456789')).toBe(false)
    expect(validarNifIvaUE('')).toBe(false)
  })
})

describe('validarNif — dispatcher', () => {
  it('entrada vacía / null-ish → no lanza, motivo "vacío"', () => {
    expect(validarNif('')).toEqual({ valido: false, tipo: 'desconocido', normalizado: '', motivo: 'vacío' })
    expect(validarNif('   ')).toEqual({ valido: false, tipo: 'desconocido', normalizado: '', motivo: 'vacío' })
    expect(validarNif(null)).toEqual({ valido: false, tipo: 'desconocido', normalizado: '', motivo: 'vacío' })
    expect(validarNif(undefined)).toEqual({ valido: false, tipo: 'desconocido', normalizado: '', motivo: 'vacío' })
  })

  it('clasifica el tipo de los válidos', () => {
    expect(validarNif('12345678Z')).toMatchObject({ valido: true, tipo: 'dni', normalizado: '12345678Z' })
    expect(validarNif('X1234567L')).toMatchObject({ valido: true, tipo: 'nie' })
    expect(validarNif('B75939868')).toMatchObject({ valido: true, tipo: 'cif' })
  })

  it('devuelve el normalizado aunque sea inválido', () => {
    expect(validarNif('12345678-a')).toMatchObject({ valido: false, normalizado: '12345678A' })
  })

  it('motivo accionable: dice qué letra se esperaba', () => {
    const r = validarNif('12345678A')
    expect(r.valido).toBe(false)
    expect(r.tipo).toBe('dni')
    expect(r.motivo).toBe('letra de control incorrecta: esperada Z')
  })

  it('motivo del NIE indica la letra esperada', () => {
    expect(validarNif('X1234567A').motivo).toBe('letra de control incorrecta: esperada L')
  })

  it('motivo del CIF indica el control esperado según la familia', () => {
    expect(validarNif('B75939861').motivo).toBe('carácter de control incorrecto: esperado 8')
    expect(validarNif('Q2826000I').motivo).toBe('carácter de control incorrecto: esperado H')
    expect(validarNif('J28260007').motivo).toBe('carácter de control incorrecto: esperado 8 o H')
  })

  it('forma no reconocida → tipo desconocido', () => {
    const r = validarNif('BASURA123')
    expect(r).toMatchObject({ valido: false, tipo: 'desconocido', motivo: 'formato no reconocido' })
    expect(validarNif('!!!').motivo).toBe('formato no reconocido')
  })

  it('pais != ES → se valida como NIF-IVA intracomunitario', () => {
    expect(validarNif('DE123456789', 'DE')).toMatchObject({ valido: true, tipo: 'nif-iva-ue' })
    const r = validarNif('DE12345', 'DE')
    expect(r).toMatchObject({ valido: false, tipo: 'nif-iva-ue' })
    expect(r.motivo).toContain('DE')
  })

  it('pais ES por defecto: un NIF-IVA alemán NO valida como español', () => {
    expect(validarNif('DE123456789').valido).toBe(false)
  })
})

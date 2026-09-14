/**
 * validarFicha: parser/validador puro de la ficha comercial (sin pg).
 */
jest.mock('@/lib/direct-database', () => ({ pool: { query: jest.fn() } }))

import { validarFicha, parseNumeroFicha } from '@/lib/fichaComercial'

describe('validarFicha', () => {
  it('acepta un body completo válido', () => {
    const r = validarFicha({
      regimen: 'REBU',
      nombre_comercial: '  Kia XCeed PHEV ',
      precio_contado: 12485,
      url_imagen: 'https://x/y.jpg',
      url_qr: '',
      mantenimientos: 'H-L VIC',
      tarifa_financiacion: 'SIN_DTO',
      garantia: 'SI',
      gp: 490,
      pct_dto: 0.07,
      meses_garantia_fabrica: 36,
      motor_cv: 105,
      cubicaje: 1598,
      caja: 'Automático',
      combustible: 'Híbrido',
    })
    expect(r).toEqual({
      ok: true,
      patch: {
        regimen: 'REBU',
        nombre_comercial: 'Kia XCeed PHEV',
        precio_contado: 12485,
        url_imagen: 'https://x/y.jpg',
        url_qr: null,
        mantenimientos: 'H-L VIC',
        tarifa_financiacion: 'SIN_DTO',
        garantia: true,
        gp: 490,
        pct_dto: 0.07,
        meses_garantia_fabrica: 36,
        motor_cv: 105,
        cubicaje: 1598,
        caja: 'Automático',
        combustible: 'Híbrido',
      },
    })
  })

  it('rangos: pct_dto, gp, precio_contado', () => {
    expect(validarFicha({ pct_dto: 0.25 })).toMatchObject({ ok: false })
    expect(validarFicha({ pct_dto: 7 })).toMatchObject({ ok: false })
    expect(validarFicha({ pct_dto: 0 })).toEqual({
      ok: true,
      patch: { pct_dto: 0 },
    })
    expect(validarFicha({ gp: 2500 })).toMatchObject({ ok: false })
    expect(validarFicha({ gp: 0 })).toEqual({ ok: true, patch: { gp: 0 } })
    expect(validarFicha({ precio_contado: 0 })).toMatchObject({ ok: false })
    expect(validarFicha({ precio_contado: '-1' })).toMatchObject({ ok: false })
    expect(validarFicha({ precio_contado: '12.485,50' })).toEqual({
      ok: true,
      patch: { precio_contado: 12485.5 },
    })
  })

  it('enums y booleanos', () => {
    expect(validarFicha({ regimen: 'iva' })).toMatchObject({ ok: false })
    expect(validarFicha({ tarifa_financiacion: 'SIN DTO' })).toMatchObject({
      ok: false,
    })
    expect(validarFicha({ garantia: 'NO' })).toEqual({
      ok: true,
      patch: { garantia: false },
    })
    expect(validarFicha({ garantia: 'quizás' })).toMatchObject({ ok: false })
  })

  it("'' = null, claves desconocidas fuera, body vacío ok", () => {
    expect(validarFicha({ regimen: '', gp: '', foo: 1 })).toEqual({
      ok: true,
      patch: { regimen: null, gp: null },
    })
    expect(validarFicha({})).toEqual({ ok: true, patch: {} })
    expect(validarFicha(null)).toMatchObject({ ok: false })
  })

  it('enteros', () => {
    expect(validarFicha({ motor_cv: 1.5 })).toMatchObject({ ok: false })
    expect(validarFicha({ cubicaje: '-3' })).toMatchObject({ ok: false })
    expect(validarFicha({ meses_garantia_fabrica: '24' })).toEqual({
      ok: true,
      patch: { meses_garantia_fabrica: 24 },
    })
  })
})

describe('parseNumeroFicha', () => {
  it('formatos de hoja', () => {
    expect(parseNumeroFicha('12.485 €')).toBe(12485)
    expect(parseNumeroFicha('0,07')).toBe(0.07)
    expect(parseNumeroFicha('7%')).toBe(7)
    expect(parseNumeroFicha('abc')).toBeNull()
    expect(parseNumeroFicha(null)).toBeNull()
  })
})

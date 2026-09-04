import {
  estadoVencimiento,
  formatFechaCorta,
  textoVencimiento,
} from '@/lib/vencimientos'
import { dateToYMD, esFechaYMD, normalizarFechaYMD } from '@/lib/fechas'

const HOY = '2026-09-04'

describe('estadoVencimiento', () => {
  it('null / vacío / inválida → sin estado', () => {
    expect(estadoVencimiento(null, HOY)).toBeNull()
    expect(estadoVencimiento(undefined, HOY)).toBeNull()
    expect(estadoVencimiento('', HOY)).toBeNull()
    expect(estadoVencimiento('no', HOY)).toBeNull()
    expect(estadoVencimiento('2026-02-30', HOY)).toBeNull()
  })

  it('ayer → vencida (dias = -1)', () => {
    expect(estadoVencimiento('2026-09-03', HOY)).toEqual({
      estado: 'vencida',
      dias: -1,
    })
  })

  it('hoy → próxima con 0 días', () => {
    expect(estadoVencimiento(HOY, HOY)).toEqual({ estado: 'proxima', dias: 0 })
  })

  it('en 10 días → próxima con N = 10', () => {
    expect(estadoVencimiento('2026-09-14', HOY)).toEqual({
      estado: 'proxima',
      dias: 10,
    })
  })

  it('en 30 días → próxima; en 31 → ok', () => {
    expect(estadoVencimiento('2026-10-04', HOY)?.estado).toBe('proxima')
    expect(estadoVencimiento('2026-10-05', HOY)?.estado).toBe('ok')
  })

  it('en 60 días → ok', () => {
    expect(estadoVencimiento('2026-11-03', HOY)).toEqual({
      estado: 'ok',
      dias: 60,
    })
  })

  it('acepta Date como hoy y como fecha (componentes locales)', () => {
    const hoy = new Date(2026, 8, 4)
    expect(estadoVencimiento(new Date(2026, 8, 3), hoy)?.estado).toBe('vencida')
    expect(estadoVencimiento('2026-09-14', hoy)?.dias).toBe(10)
  })
})

describe('textoVencimiento', () => {
  it('vencida / hoy / N días / ok', () => {
    expect(textoVencimiento({ estado: 'vencida', dias: -3 })).toBe('Vencida')
    expect(textoVencimiento({ estado: 'proxima', dias: 0 })).toBe('Vence hoy')
    expect(textoVencimiento({ estado: 'proxima', dias: 1 })).toBe(
      'Vence en 1 día'
    )
    expect(textoVencimiento({ estado: 'proxima', dias: 10 })).toBe(
      'Vence en 10 días'
    )
    expect(textoVencimiento({ estado: 'ok', dias: 60 })).toBeNull()
    expect(textoVencimiento(null)).toBeNull()
  })
})

describe('formatFechaCorta', () => {
  it('YYYY-MM-DD → dd/mm/aaaa', () => {
    expect(formatFechaCorta('2026-09-04')).toBe('04/09/2026')
    expect(formatFechaCorta(null)).toBe('')
    expect(formatFechaCorta('rota')).toBe('')
  })
})

describe('dateToYMD (DATE de pg → YYYY-MM-DD)', () => {
  it('Date a medianoche local → mismo día (sin corrimiento por zona horaria)', () => {
    // pg construye DATE como new Date(y, m, d) en hora local
    expect(dateToYMD(new Date(2026, 8, 4))).toBe('2026-09-04')
    expect(dateToYMD(new Date(2026, 0, 1))).toBe('2026-01-01')
  })

  it('string ISO con hora → recorta a la fecha', () => {
    expect(dateToYMD('2026-09-04T00:00:00.000Z')).toBe('2026-09-04')
    expect(dateToYMD('2026-09-04')).toBe('2026-09-04')
  })

  it('null / vacío / inválido → null', () => {
    expect(dateToYMD(null)).toBeNull()
    expect(dateToYMD(undefined)).toBeNull()
    expect(dateToYMD('')).toBeNull()
    expect(dateToYMD('No')).toBeNull()
    expect(dateToYMD('2026-13-01')).toBeNull()
    expect(dateToYMD(new Date('nope'))).toBeNull()
  })
})

describe('esFechaYMD / normalizarFechaYMD', () => {
  it('valida formato y calendario', () => {
    expect(esFechaYMD('2026-09-04')).toBe(true)
    expect(esFechaYMD('2026-02-29')).toBe(false)
    expect(esFechaYMD('04/09/2026')).toBe(false)
    expect(esFechaYMD(20260904)).toBe(false)
  })

  it('normaliza entrada de formulario: vacío/inválido → null', () => {
    expect(normalizarFechaYMD('')).toBeNull()
    expect(normalizarFechaYMD('   ')).toBeNull()
    expect(normalizarFechaYMD('2026-09-04')).toBe('2026-09-04')
  })
})

import { monthRange, EMITTED_STATUSES } from '@/lib/facturasMonitor'

describe('monthRange — rango [from, to) por año/mes', () => {
  it('año completo', () => {
    expect(monthRange(2026)).toEqual({ from: '2026-01-01', to: '2027-01-01' })
  })

  it('mes concreto (abril)', () => {
    expect(monthRange(2026, 4)).toEqual({ from: '2026-04-01', to: '2026-05-01' })
  })

  it('enero (mes 1)', () => {
    expect(monthRange(2026, 1)).toEqual({ from: '2026-01-01', to: '2026-02-01' })
  })

  it('diciembre cierra en el año siguiente (borde off-by-one)', () => {
    expect(monthRange(2026, 12)).toEqual({ from: '2026-12-01', to: '2027-01-01' })
  })

  it('mes inválido → cae a año completo', () => {
    expect(monthRange(2026, 0)).toEqual({ from: '2026-01-01', to: '2027-01-01' })
    expect(monthRange(2026, 13)).toEqual({ from: '2026-01-01', to: '2027-01-01' })
  })
})

describe('EMITTED_STATUSES — estados que cuentan como factura emitida', () => {
  it('incluye ISSUED e IMPORTED, no ACTIVE', () => {
    expect(EMITTED_STATUSES).toContain('ISSUED')
    expect(EMITTED_STATUSES).toContain('IMPORTED')
    expect(EMITTED_STATUSES as readonly string[]).not.toContain('ACTIVE')
  })
})

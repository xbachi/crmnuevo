import { nombrePdfPresupuesto } from '@/lib/presupuesto/enlaces'

describe('nombrePdfPresupuesto', () => {
  it('usa el nombre comercial canónico y la matrícula sin separadores', () => {
    expect(
      nombrePdfPresupuesto('P-2026-0001', {
        nombre_comercial: 'Tesla Model 3 RWD',
        marca: 'Tesla',
        modelo: 'Model 3',
        matricula: '1234 ABC',
      })
    ).toBe('Presupuesto-P-2026-0001-Tesla-Model-3-Rwd-1234ABC.pdf')
  })

  it('sin nombre comercial usa marca-modelo', () => {
    expect(
      nombrePdfPresupuesto('P-2026-0002', {
        nombre_comercial: null,
        marca: 'Citroën',
        modelo: 'C4 picasso',
        matricula: '8061-krn',
      })
    ).toBe('Presupuesto-P-2026-0002-Citroen-C4-Picasso-8061KRN.pdf')
  })

  it('omite segmentos vacíos sin dejar guiones dobles', () => {
    expect(nombrePdfPresupuesto('P-2026-0003', { matricula: null })).toBe(
      'Presupuesto-P-2026-0003.pdf'
    )
    expect(
      nombrePdfPresupuesto('P-2026-0004', { marca: 'Seat', matricula: '' })
    ).toBe('Presupuesto-P-2026-0004-Seat.pdf')
  })
})

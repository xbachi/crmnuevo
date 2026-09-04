/**
 * derivarVentasStats — año / mes anterior / mes actual a partir de la serie
 * mensual de /api/ventas?periodo=13_meses (una sola request en vez de tres).
 */
import { claveMes, derivarVentasStats } from '@/lib/ventasPorMes'

const fila = (mes: string, cantidad: number) => ({
  mes,
  año: Number(mes.slice(0, 4)),
  cantidad,
})

describe('claveMes', () => {
  it('formatea YYYY-MM en UTC con cero a la izquierda', () => {
    expect(claveMes(new Date(Date.UTC(2026, 8, 4)))).toBe('2026-09')
    expect(claveMes(new Date(Date.UTC(2026, 0, 1)))).toBe('2026-01')
  })
})

describe('derivarVentasStats', () => {
  it('a mitad de año: año = suma de meses del año, mes anterior y actual', () => {
    const serie = [
      fila('2025-09', 7), // fuera del año → no suma al año
      fila('2025-12', 4),
      fila('2026-01', 3),
      fila('2026-03', 5),
      fila('2026-08', 6),
      fila('2026-09', 2),
    ]
    const hoy = new Date(Date.UTC(2026, 8, 4)) // 4 sep 2026

    expect(derivarVentasStats(serie, hoy)).toEqual({
      añoActual: 3 + 5 + 6 + 2,
      ultimoMes: 6,
      mesActual: 2,
    })
  })

  it('en enero: mes anterior es diciembre del año pasado y no suma al año', () => {
    const serie = [fila('2025-11', 9), fila('2025-12', 4), fila('2026-01', 3)]
    const hoy = new Date(Date.UTC(2026, 0, 15))

    expect(derivarVentasStats(serie, hoy)).toEqual({
      añoActual: 3,
      ultimoMes: 4,
      mesActual: 3,
    })
  })

  it('meses sin fila → 0; serie vacía → todo 0', () => {
    const hoy = new Date(Date.UTC(2026, 4, 10))
    expect(derivarVentasStats([fila('2026-02', 8)], hoy)).toEqual({
      añoActual: 8,
      ultimoMes: 0,
      mesActual: 0,
    })
    expect(derivarVentasStats([], hoy)).toEqual({
      añoActual: 0,
      ultimoMes: 0,
      mesActual: 0,
    })
  })

  it('tolera cantidades/años como string (JSON de pg)', () => {
    const serie = [
      { mes: '2026-05', año: '2026', cantidad: '4' },
      { mes: '2026-04', año: '2026', cantidad: '2' },
    ] as unknown as Parameters<typeof derivarVentasStats>[0]
    const hoy = new Date(Date.UTC(2026, 4, 10))
    expect(derivarVentasStats(serie, hoy)).toEqual({
      añoActual: 6,
      ultimoMes: 2,
      mesActual: 4,
    })
  })

  it('el mes anterior se calcula bien a fin de mes (31 mar → feb)', () => {
    const serie = [fila('2026-02', 5), fila('2026-03', 1)]
    const hoy = new Date(Date.UTC(2026, 2, 31, 23, 59))
    expect(derivarVentasStats(serie, hoy)).toEqual({
      añoActual: 6,
      ultimoMes: 5,
      mesActual: 1,
    })
  })
})

import {
  periodoFromDate,
  gestoriaFolder,
  carpetaDestino,
  isValidIsoDate,
  normPlate,
} from '@/lib/facturasRegistro'

describe('periodoFromDate', () => {
  it('deriva año/trimestre/mes', () => {
    expect(periodoFromDate('2026-06-18')).toEqual({
      anio: 2026,
      trimestre: 2,
      mes: 6,
    })
    expect(periodoFromDate('2026-01-05')).toEqual({
      anio: 2026,
      trimestre: 1,
      mes: 1,
    })
    expect(periodoFromDate('2026-12-31')).toEqual({
      anio: 2026,
      trimestre: 4,
      mes: 12,
    })
  })
  it('null si inválida', () => {
    expect(periodoFromDate('')).toEqual({
      anio: null,
      trimestre: null,
      mes: null,
    })
    expect(periodoFromDate(undefined)).toEqual({
      anio: null,
      trimestre: null,
      mes: null,
    })
  })
})

describe('gestoriaFolder', () => {
  it('arma la ruta del mes con el trimestre correcto', () => {
    expect(gestoriaFolder(2026, 6)).toBe(
      'GESTORIA/2026/2do trimestre/Facturas/junio'
    )
    expect(gestoriaFolder(2026, 1)).toBe(
      'GESTORIA/2026/1re trimestre/Facturas/enero'
    )
    expect(gestoriaFolder(2026, 10)).toBe(
      'GESTORIA/2026/4to trimestre/Facturas/octubre'
    )
  })
  it('null sin período', () => {
    expect(gestoriaFolder(null, 6)).toBeNull()
    expect(gestoriaFolder(2026, null)).toBeNull()
  })
})

describe('isValidIsoDate', () => {
  it('acepta fechas reales y rechaza formatos o días imposibles', () => {
    expect(isValidIsoDate('2026-02-28')).toBe(true)
    expect(isValidIsoDate('2026-02-29')).toBe(false)
    expect(isValidIsoDate('2026-13-01')).toBe(false)
    expect(isValidIsoDate('01/02/2026')).toBe(false)
  })
})

describe('carpetaDestino', () => {
  it('gestoria → carpeta del mes', () => {
    const d = carpetaDestino('gestoria', null, 2026, 6)
    expect(d.tipo).toBe('gestoria-mes')
    expect(d.ruta).toBe('GESTORIA/2026/2do trimestre/Facturas/junio')
    expect(d.matricula).toBeNull()
  })
  it('coche-compra → carpeta del coche / compras', () => {
    const d = carpetaDestino('coche-compra', '1234ABC', 2026, 6)
    expect(d.tipo).toBe('coche')
    expect(d.matricula).toBe('1234ABC')
    expect(d.subcarpeta).toBe('compras')
  })
  it('coche-servicio → carpeta del coche / servicios', () => {
    const d = carpetaDestino('coche-servicio', '1234ABC', 2026, 6)
    expect(d.subcarpeta).toBe('servicios')
  })
  it('gestoria sin fecha → sin-periodo', () => {
    expect(carpetaDestino('gestoria', null, null, null).tipo).toBe(
      'sin-periodo'
    )
  })
})

describe('normPlate', () => {
  it('normaliza matrícula', () => {
    expect(normPlate('0808 MVD')).toBe('0808MVD')
    expect(normPlate('d-16')).toBe('D16')
  })
})

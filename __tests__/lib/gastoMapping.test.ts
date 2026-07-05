import { campoParaTipo, tiposCanonicos, normPlate } from '@/lib/gastoMapping'

describe('campoParaTipo — proveedor/concepto → columna de gastos', () => {
  it('mapea cada proveedor a su columna', () => {
    expect(campoParaTipo('mecauto')).toBe('gastosMecanica')
    expect(campoParaTipo('fergo')).toBe('gastosPintura')
    expect(campoParaTipo('compra')).toBe('precioCompra')
    expect(campoParaTipo('itv')).toBe('gastosOtros')
  })

  it('todas las variantes de limpieza caen en gastosLimpieza', () => {
    for (const t of ['world', 'world-detailing', 'worlddetailing', 'limpieza']) {
      expect(campoParaTipo(t)).toBe('gastosLimpieza')
    }
  })

  it('transporte y porte caen en gastosTransporte', () => {
    expect(campoParaTipo('transporte')).toBe('gastosTransporte')
    expect(campoParaTipo('porte')).toBe('gastosTransporte')
  })

  it('es case/space-insensitive', () => {
    expect(campoParaTipo('  MECAUTO ')).toBe('gastosMecanica')
    expect(campoParaTipo('World-Detailing')).toBe('gastosLimpieza')
  })

  it('devuelve null para tipos desconocidos', () => {
    expect(campoParaTipo('desconocido')).toBeNull()
    expect(campoParaTipo('')).toBeNull()
  })
})

describe('tiposCanonicos — tipos que comparten un campo (para sumar sus facturas)', () => {
  it('gastosLimpieza agrupa las 4 variantes', () => {
    expect(tiposCanonicos('gastosLimpieza').sort()).toEqual(
      ['limpieza', 'world', 'world-detailing', 'worlddetailing'].sort()
    )
  })
  it('gastosTransporte agrupa transporte y porte', () => {
    expect(tiposCanonicos('gastosTransporte').sort()).toEqual(['porte', 'transporte'].sort())
  })
  it('un campo con un solo tipo se devuelve solo', () => {
    expect(tiposCanonicos('gastosMecanica')).toEqual(['mecauto'])
    expect(tiposCanonicos('precioCompra')).toEqual(['compra'])
  })
})

describe('normPlate', () => {
  it('normaliza para resolver el vehículo por matrícula', () => {
    expect(normPlate('1234-abc')).toBe('1234ABC')
    expect(normPlate('1234 ABC')).toBe('1234ABC')
    expect(normPlate('1.234.abc')).toBe('1234ABC')
  })
})

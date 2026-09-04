/**
 * Lógica pura de precarga del wizard /deals/nuevo (?vehiculoId= / ?clienteId=).
 */
import {
  puedePreseleccionarVehiculo,
  resolverPasoInicial,
} from '@/lib/dealWizard'

describe('resolverPasoInicial', () => {
  it('sin nada precargado → paso 1 (cliente)', () => {
    expect(resolverPasoInicial({ cliente: false, vehiculo: false })).toBe(1)
  })

  it('solo vehículo → paso 1 (falta elegir cliente; el vehículo ya queda seleccionado)', () => {
    expect(resolverPasoInicial({ cliente: false, vehiculo: true })).toBe(1)
  })

  it('solo cliente → paso 2 (elegir vehículo)', () => {
    expect(resolverPasoInicial({ cliente: true, vehiculo: false })).toBe(2)
  })

  it('cliente y vehículo → paso 3 (datos de la reserva)', () => {
    expect(resolverPasoInicial({ cliente: true, vehiculo: true })).toBe(3)
  })
})

describe('puedePreseleccionarVehiculo', () => {
  it('PUBLICADO sin venta → sí', () => {
    expect(
      puedePreseleccionarVehiculo({ estado: 'PUBLICADO', venta: null })
    ).toBe(true)
  })

  it('alias ACTIVO / sin estado → sí', () => {
    expect(puedePreseleccionarVehiculo({ estado: 'ACTIVO' })).toBe(true)
    expect(puedePreseleccionarVehiculo({ estado: null })).toBe(true)
    expect(puedePreseleccionarVehiculo({})).toBe(true)
  })

  it('reservado (cualquier casing) → no', () => {
    expect(puedePreseleccionarVehiculo({ estado: 'reservado' })).toBe(false)
    expect(puedePreseleccionarVehiculo({ estado: 'RESERVADO' })).toBe(false)
  })

  it('VENDIDO → no', () => {
    expect(puedePreseleccionarVehiculo({ estado: 'vendido' })).toBe(false)
  })

  it('con venta activa aunque el estado sea disponible → no', () => {
    expect(
      puedePreseleccionarVehiculo({
        estado: 'DISPONIBLE',
        venta: { dealId: 42 },
      })
    ).toBe(false)
    expect(
      puedePreseleccionarVehiculo({ estado: 'PUBLICADO', dealActivoId: 7 })
    ).toBe(false)
  })
})

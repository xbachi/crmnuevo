/**
 * Máquina de estados del vehículo: normalización + transiciones + whitelist.
 */
import {
  ESTADOS_VEHICULO,
  TRANSICIONES,
  normalizarEstado,
  normalizarTipo,
  TIPO_LABEL,
  transicionValida,
  filtrarCamposEditables,
  CAMPOS_EDITABLES_VEHICULO,
} from '@/lib/vehiculoEstado'

describe('normalizarTipo', () => {
  it('deja pasar las letras canónicas (case-insensitive)', () => {
    expect(normalizarTipo('C')).toBe('C')
    expect(normalizarTipo('I')).toBe('I')
    expect(normalizarTipo('D')).toBe('D')
    expect(normalizarTipo('R')).toBe('R')
    expect(normalizarTipo('M')).toBe('M')
    expect(normalizarTipo('manual')).toBe('M')
    expect(normalizarTipo('c')).toBe('C')
    expect(normalizarTipo(' r ')).toBe('R')
  })

  it('traduce las palabras de los modales viejos a letra', () => {
    expect(normalizarTipo('Compra')).toBe('C')
    expect(normalizarTipo('compra')).toBe('C')
    expect(normalizarTipo('Inversor')).toBe('I')
    expect(normalizarTipo('INVERSOR')).toBe('I')
    expect(normalizarTipo('Coche R')).toBe('R')
    expect(normalizarTipo('coche r')).toBe('R')
  })

  it('acepta depósito con/sin tilde, con/sin "Venta" y espacios raros', () => {
    expect(normalizarTipo('Deposito')).toBe('D')
    expect(normalizarTipo('Depósito')).toBe('D')
    expect(normalizarTipo('Deposito Venta')).toBe('D')
    expect(normalizarTipo('Depósito Venta')).toBe('D')
    expect(normalizarTipo('  depósito   venta  ')).toBe('D')
  })

  it('devuelve null para valores desconocidos o vacíos', () => {
    expect(normalizarTipo('X')).toBeNull()
    expect(normalizarTipo('Renting')).toBeNull()
    expect(normalizarTipo('cocheR')).toBeNull()
    expect(normalizarTipo('')).toBeNull()
    expect(normalizarTipo(null)).toBeNull()
    expect(normalizarTipo(undefined)).toBeNull()
  })

  it('TIPO_LABEL cubre las cinco letras canónicas', () => {
    expect(TIPO_LABEL).toEqual({
      C: 'Compra',
      I: 'Inversor',
      D: 'Depósito Venta',
      R: 'Coche R',
      M: 'Venta manual',
    })
  })
})

describe('normalizarEstado', () => {
  it('normaliza casing y espacios', () => {
    expect(normalizarEstado('vendido')).toBe('VENDIDO')
    expect(normalizarEstado(' Vendido ')).toBe('VENDIDO')
    expect(normalizarEstado('RESERVADO')).toBe('RESERVADO')
    expect(normalizarEstado('publicado')).toBe('PUBLICADO')
  })

  it('resuelve aliases reales del código/UI', () => {
    expect(normalizarEstado('')).toBe('SIN_ESTADO')
    expect(normalizarEstado(null)).toBe('SIN_ESTADO')
    expect(normalizarEstado(undefined)).toBe('SIN_ESTADO')
    expect(normalizarEstado('INICIAL')).toBe('SIN_ESTADO')
    expect(normalizarEstado('ACTIVO')).toBe('DISPONIBLE')
    expect(normalizarEstado('EN_STOCK')).toBe('DISPONIBLE')
    expect(normalizarEstado('disponible')).toBe('DISPONIBLE')
  })

  it('devuelve null para valores no reconocibles', () => {
    expect(normalizarEstado('CUALQUIER_COSA')).toBeNull()
    expect(normalizarEstado('vendidoo')).toBeNull()
  })
})

describe('TRANSICIONES (grafo)', () => {
  it('cubre todos los estados canónicos y solo apunta a canónicos', () => {
    for (const estado of ESTADOS_VEHICULO) {
      expect(TRANSICIONES[estado]).toBeDefined()
      for (const destino of TRANSICIONES[estado]) {
        expect(ESTADOS_VEHICULO).toContain(destino)
      }
    }
  })

  it('VENDIDO es terminal salvo anulación → DISPONIBLE', () => {
    expect(TRANSICIONES.VENDIDO).toEqual(['DISPONIBLE'])
  })
})

describe('transicionValida', () => {
  it('acepta el flujo feliz entrada→preparación→publicado→reservado→vendido', () => {
    expect(transicionValida('SIN_ESTADO', 'REVI_INIC')).toBe(true)
    expect(transicionValida('REVI_INIC', 'MECAUTO')).toBe(true)
    expect(transicionValida('MECAUTO', 'PINTURA')).toBe(true)
    expect(transicionValida('LIMPIEZA', 'FOTOS')).toBe(true)
    expect(transicionValida('FOTOS', 'PUBLICADO')).toBe(true)
    expect(transicionValida('PUBLICADO', 'RESERVADO')).toBe(true)
    expect(transicionValida('RESERVADO', 'VENDIDO')).toBe(true)
  })

  it('permite vueltas atrás con sentido', () => {
    expect(transicionValida('RESERVADO', 'PUBLICADO')).toBe(true) // se cae la reserva
    expect(transicionValida('PUBLICADO', 'FOTOS')).toBe(true) // retoques
    expect(transicionValida('VENDIDO', 'DISPONIBLE')).toBe(true) // contrato anulado
    expect(transicionValida('RESERVADO', 'DISPONIBLE')).toBe(true)
  })

  it('permite venta directa desde preparación (comportamiento actual de la UI)', () => {
    expect(transicionValida('MECAUTO', 'VENDIDO')).toBe(true)
    expect(transicionValida('SIN_ESTADO', 'RESERVADO')).toBe(true)
  })

  it('rechaza resurrecciones desde VENDIDO', () => {
    expect(transicionValida('VENDIDO', 'PUBLICADO')).toBe(false)
    expect(transicionValida('VENDIDO', 'RESERVADO')).toBe(false)
    expect(transicionValida('VENDIDO', 'MECAUTO')).toBe(false)
    expect(transicionValida('vendido', 'publicado')).toBe(false) // case-insensitive
  })

  it('rechaza volver a preparación desde RESERVADO', () => {
    expect(transicionValida('RESERVADO', 'MECAUTO')).toBe(false)
  })

  it('rechaza estados destino no reconocibles', () => {
    expect(transicionValida('PUBLICADO', 'BASURA')).toBe(false)
  })

  it('mismo estado (normalizado) es no-op válido', () => {
    expect(transicionValida('VENDIDO', 'vendido')).toBe(true)
    expect(transicionValida('EN_STOCK', 'DISPONIBLE')).toBe(true) // alias
  })

  it('desde un estado sucio no reconocible permite salir (no atrapa el vehículo)', () => {
    expect(transicionValida('LEGACY_RARO', 'PUBLICADO')).toBe(true)
  })

  it('resuelve aliases en ambos extremos', () => {
    expect(transicionValida('ACTIVO', 'VENDIDO')).toBe(true) // DISPONIBLE→VENDIDO
    expect(transicionValida('', 'REVI_INIC')).toBe(true) // SIN_ESTADO→REVI_INIC
  })
})

describe('filtrarCamposEditables', () => {
  it('deja pasar solo campos de la whitelist', () => {
    const { data, ignorados } = filtrarCamposEditables({
      marca: 'Seat',
      estado: 'PUBLICADO',
      precioCompra: 9000,
      id: 999,
      force: true,
      dealActivoId: 55,
      orden: 3,
      hackField: 'x',
    })
    expect(data).toEqual({
      marca: 'Seat',
      estado: 'PUBLICADO',
      precioCompra: 9000,
    })
    expect(ignorados).toEqual(
      expect.arrayContaining(['id', 'force', 'dealActivoId', 'orden', 'hackField'])
    )
  })

  it('la whitelist no incluye campos internos', () => {
    const lista = CAMPOS_EDITABLES_VEHICULO as readonly string[]
    for (const interno of ['id', 'orden', 'dealActivoId', 'createdAt', 'updatedAt', 'matricula_norm', 'beneficioNeto']) {
      expect(lista).not.toContain(interno)
    }
  })
})

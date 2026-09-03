/**
 * bucketDeEstado: clasificación de estados en los filtros de /vehiculos.
 * DISPONIBLE (vuelta a stock) y vacío/null deben caer en enProceso, no
 * desaparecer de todos los filtros.
 */
import { bucketDeEstado, labelTipo } from '@/lib/vehiculoEstado'

describe('bucketDeEstado', () => {
  it('manda DISPONIBLE (y sus aliases) a enProceso', () => {
    expect(bucketDeEstado('DISPONIBLE')).toBe('enProceso')
    expect(bucketDeEstado('disponible')).toBe('enProceso')
    expect(bucketDeEstado('EN_STOCK')).toBe('enProceso')
    expect(bucketDeEstado('en_stock')).toBe('enProceso')
    expect(bucketDeEstado('ACTIVO')).toBe('enProceso')
  })

  it('manda vacío / null / undefined / inicial a enProceso', () => {
    expect(bucketDeEstado('')).toBe('enProceso')
    expect(bucketDeEstado('   ')).toBe('enProceso')
    expect(bucketDeEstado(null)).toBe('enProceso')
    expect(bucketDeEstado(undefined)).toBe('enProceso')
    expect(bucketDeEstado('INICIAL')).toBe('enProceso')
    expect(bucketDeEstado('inicial')).toBe('enProceso')
  })

  it('clasifica los estados de preparación como enProceso', () => {
    expect(bucketDeEstado('SIN_ESTADO')).toBe('enProceso')
    expect(bucketDeEstado('REVI_INIC')).toBe('enProceso')
    expect(bucketDeEstado('mecauto')).toBe('enProceso')
    expect(bucketDeEstado('REVI_PINTURA')).toBe('enProceso')
    expect(bucketDeEstado('PINTURA')).toBe('enProceso')
    expect(bucketDeEstado('LIMPIEZA')).toBe('enProceso')
    expect(bucketDeEstado('fotos')).toBe('enProceso')
  })

  it('clasifica VENDIDO / RESERVADO / PUBLICADO (case-insensitive, con espacios)', () => {
    expect(bucketDeEstado('VENDIDO')).toBe('vendidos')
    expect(bucketDeEstado('vendido')).toBe('vendidos')
    expect(bucketDeEstado(' Vendido ')).toBe('vendidos')
    expect(bucketDeEstado('RESERVADO')).toBe('reservados')
    expect(bucketDeEstado('reservado')).toBe('reservados')
    expect(bucketDeEstado('PUBLICADO')).toBe('publicados')
    expect(bucketDeEstado('publicado')).toBe('publicados')
  })

  it('un estado no reconocible no desaparece: cae en enProceso', () => {
    expect(bucketDeEstado('BASURA')).toBe('enProceso')
  })
})

describe('labelTipo', () => {
  it('usa TIPO_LABEL para letras y palabras conocidas', () => {
    expect(labelTipo('R')).toBe('Coche R')
    expect(labelTipo('C')).toBe('Compra')
    expect(labelTipo('Deposito')).toBe('Depósito Venta')
    expect(labelTipo('M')).toBe('Venta manual')
  })

  it('devuelve el valor crudo (o vacío) si no se reconoce', () => {
    expect(labelTipo('X')).toBe('X')
    expect(labelTipo(null)).toBe('')
    expect(labelTipo(undefined)).toBe('')
  })
})

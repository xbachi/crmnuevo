import { resolverTipoSheets } from '@/lib/sheetsConfig'

describe('resolverTipoSheets', () => {
  it.each([
    ['C', { ventas: 'Expo', compras: 'Compras' }],
    ['I', { ventas: 'Expo', compras: 'Compras' }],
    ['Compra', { ventas: 'Expo', compras: 'Compras' }],
    ['D', { ventas: 'Deposito', compras: 'Deposito' }],
    ['Deposito Venta', { ventas: 'Deposito', compras: 'Deposito' }],
    ['R', { ventas: 'R', compras: 'R' }],
    ['Coche R', { ventas: 'R', compras: 'R' }],
    [undefined, { ventas: 'Expo', compras: 'Compras' }],
  ])('%p → %p', (tipo, esperado) => {
    expect(resolverTipoSheets(tipo)).toEqual(esperado)
  })
})

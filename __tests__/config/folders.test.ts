import {
  FOLDER_PATHS,
  generateFolderName,
  getFolderPathsByTipo,
} from '@/config/folders'

describe('generateFolderName', () => {
  it.each([
    ['#1001', 'C', '01-Opel-Astra-8061KRN'],
    ['#R-11', 'R', 'R-11-Opel-Astra-8061KRN'],
    ['11', 'Coche R', 'R-11-Opel-Astra-8061KRN'],
    ['#D-2', 'D', 'D-02-Opel-Astra-8061KRN'],
    ['#1150', 'C', '150-Opel-Astra-8061KRN'],
  ])('%p (%p) → %p', (ref, tipo, esperado) => {
    expect(generateFolderName(ref, 'opel', 'astra', '8061KRN', tipo)).toBe(
      esperado
    )
  })
})

describe('getFolderPathsByTipo', () => {
  it('R → dos rutas de Coches R', () => {
    const rutas = getFolderPathsByTipo('R', 'x')
    expect(rutas).toEqual([
      `${FOLDER_PATHS.COCHE_R.VENTAS}\\x`,
      `${FOLDER_PATHS.COCHE_R.COMPRAS}\\x`,
    ])
  })

  it('Deposito Venta (legacy) → Consignación', () => {
    const rutas = getFolderPathsByTipo('Deposito Venta', 'x')
    expect(rutas).toEqual([
      `${FOLDER_PATHS.DEPOSITO_VENTA.COMPRAS}\\x`,
      `${FOLDER_PATHS.DEPOSITO_VENTA.VENTAS}\\x`,
    ])
  })

  it('I (inversor) → Compra', () => {
    const rutas = getFolderPathsByTipo('I', 'x')
    expect(rutas).toEqual([
      `${FOLDER_PATHS.COMPRA.COMPRAS}\\x`,
      `${FOLDER_PATHS.COMPRA.VENTAS}\\x`,
    ])
  })

  it('tipo desconocido → []', () => {
    expect(getFolderPathsByTipo('zzz', 'x')).toEqual([])
  })
})

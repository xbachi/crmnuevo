import { parseResyncCostoBeneficioParams } from '@/lib/resyncCostoBeneficioParams'

const parse = (query: string) =>
  parseResyncCostoBeneficioParams(new URLSearchParams(query), 2026)

describe('parámetros seguros del resync de CB', () => {
  it('rechaza dryRun=1 en vez de ejecutar por accidente', () => {
    expect(() => parse('dryRun=1&mode=overwrite')).toThrow(
      'dryRun debe ser "true" o "false"'
    )
  })

  it.each(['mode=overwrite', 'reorderApril=true', 'clearCompra=1234ABC'])(
    'exige simulación o confirmación para %s',
    (query) => {
      expect(() => parse(query)).toThrow('acción destructiva sin confirmación')
    }
  )

  it.each([
    'mode=overwrite&dryRun=true',
    'reorderApril=true&dryRun=true',
    'clearCompra=1234ABC&confirm=true',
  ])('acepta la acción protegida %s', (query) => {
    expect(parse(query).destructiveActions.length).toBeGreaterThan(0)
  })

  it('rechaza parámetros desconocidos o repetidos', () => {
    expect(() => parse('dryrun=true')).toThrow('parámetro desconocido')
    expect(() => parse('year=2026&year=2027')).toThrow('parámetro repetido')
  })

  it('deriva la pestaña del año y rechaza acciones incompatibles', () => {
    expect(parse('year=2025').tab).toBe('CB 2025')
    expect(() =>
      parse('clearCompra=1234ABC&mode=overwrite&confirm=true')
    ).toThrow('no se puede combinar')
  })

  it('mantiene fill como operación normal no destructiva', () => {
    expect(parse('year=2026')).toMatchObject({
      year: 2026,
      tab: 'CB 2026',
      dryRun: false,
      confirmed: false,
      mode: 'fill',
      destructiveActions: [],
    })
  })
})

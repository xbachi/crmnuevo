import { AdminParamError, parseStrictBool, assertKnownParams } from '@/lib/adminParams'

const sp = (qs: string) => new URLSearchParams(qs)

describe('parseStrictBool', () => {
  it("'true' → true, 'false' → false", () => {
    expect(parseStrictBool(sp('x=true'), 'x', false)).toBe(true)
    expect(parseStrictBool(sp('x=false'), 'x', true)).toBe(false)
  })

  it('ausente → default', () => {
    expect(parseStrictBool(sp(''), 'x', false)).toBe(false)
    expect(parseStrictBool(sp('otro=1'), 'x', true)).toBe(true)
  })

  it("valores ambiguos ('1', 'yes', '') lanzan AdminParamError", () => {
    expect(() => parseStrictBool(sp('x=1'), 'x', false)).toThrow(AdminParamError)
    expect(() => parseStrictBool(sp('x=yes'), 'x', false)).toThrow(AdminParamError)
    expect(() => parseStrictBool(sp('x='), 'x', false)).toThrow(AdminParamError)
    expect(() => parseStrictBool(sp('x=TRUE'), 'x', false)).toThrow(AdminParamError)
  })

  it('el mensaje de error nombra el key y el valor recibido', () => {
    expect(() => parseStrictBool(sp('dryRun=1'), 'dryRun', false)).toThrow(
      "dryRun debe ser 'true' o 'false' (recibido '1')"
    )
  })
})

describe('assertKnownParams', () => {
  it('pasa si todos los params están en la whitelist', () => {
    expect(() => assertKnownParams(sp('year=2026&tab=CB'), ['year', 'tab'])).not.toThrow()
    expect(() => assertKnownParams(sp(''), ['year'])).not.toThrow()
  })

  it('lanza AdminParamError ante un key desconocido', () => {
    expect(() => assertKnownParams(sp('year=2026&foo=1'), ['year', 'tab'])).toThrow(AdminParamError)
  })

  it('el mensaje nombra el key desconocido y los permitidos', () => {
    expect(() => assertKnownParams(sp('foo=1'), ['year', 'tab'])).toThrow(
      "parámetro desconocido 'foo'. Permitidos: year, tab"
    )
  })
})

import {
  escribirEstadoEnParams,
  estadosIguales,
  leerEstadoDeParams,
} from '@/lib/urlState'

const DEFAULTS = {
  q: '',
  estado: 'publicados',
  pagina: 1,
  soloMios: false,
}

describe('leerEstadoDeParams', () => {
  it('devuelve los defaults cuando la URL está vacía', () => {
    expect(leerEstadoDeParams(new URLSearchParams(), DEFAULTS)).toEqual(
      DEFAULTS
    )
  })

  it('lee strings tal cual y coacciona números y booleanos', () => {
    const params = new URLSearchParams(
      'q=golf&estado=todos&pagina=3&soloMios=1'
    )
    expect(leerEstadoDeParams(params, DEFAULTS)).toEqual({
      q: 'golf',
      estado: 'todos',
      pagina: 3,
      soloMios: true,
    })
  })

  it('acepta true/false para booleanos', () => {
    expect(
      leerEstadoDeParams(new URLSearchParams('soloMios=true'), DEFAULTS)
        .soloMios
    ).toBe(true)
    expect(
      leerEstadoDeParams(new URLSearchParams('soloMios=false'), DEFAULTS)
        .soloMios
    ).toBe(false)
  })

  it('cae al default si el valor no se puede coaccionar', () => {
    const params = new URLSearchParams('pagina=abc&soloMios=quizas')
    expect(leerEstadoDeParams(params, DEFAULTS)).toMatchObject({
      pagina: 1,
      soloMios: false,
    })
    expect(
      leerEstadoDeParams(new URLSearchParams('pagina='), DEFAULTS).pagina
    ).toBe(1)
  })

  it('ignora claves ajenas a los defaults', () => {
    const estado = leerEstadoDeParams(
      new URLSearchParams('foo=bar&q=x'),
      DEFAULTS
    )
    expect(estado).toEqual({ ...DEFAULTS, q: 'x' })
    expect('foo' in estado).toBe(false)
  })

  it('no muta los defaults', () => {
    const defaults = { ...DEFAULTS }
    leerEstadoDeParams(new URLSearchParams('q=algo'), defaults)
    expect(defaults).toEqual(DEFAULTS)
  })
})

describe('escribirEstadoEnParams', () => {
  it('omite las claves con valor por defecto (URL limpia)', () => {
    const params = escribirEstadoEnParams(
      new URLSearchParams(),
      { ...DEFAULTS },
      DEFAULTS
    )
    expect(params.toString()).toBe('')
  })

  it('escribe solo las claves que difieren del default', () => {
    const params = escribirEstadoEnParams(
      new URLSearchParams(),
      { q: 'golf', estado: 'publicados', pagina: 2, soloMios: true },
      DEFAULTS
    )
    expect(params.toString()).toBe('q=golf&pagina=2&soloMios=1')
  })

  it('borra una clave que vuelve a su default y conserva las ajenas', () => {
    const params = escribirEstadoEnParams(
      new URLSearchParams('foo=bar&q=golf&pagina=2'),
      { q: '', pagina: 2 },
      DEFAULTS
    )
    expect(params.get('foo')).toBe('bar')
    expect(params.has('q')).toBe(false)
    expect(params.get('pagina')).toBe('2')
  })

  it('no muta los params de entrada', () => {
    const original = new URLSearchParams('q=golf')
    escribirEstadoEnParams(original, { q: '' }, DEFAULTS)
    expect(original.toString()).toBe('q=golf')
  })

  it('round-trip: leer(escribir(estado)) === estado', () => {
    const estado = { q: 'audi a3', estado: 'todos', pagina: 4, soloMios: true }
    const params = escribirEstadoEnParams(
      new URLSearchParams(),
      estado,
      DEFAULTS
    )
    expect(leerEstadoDeParams(params, DEFAULTS)).toEqual(estado)
  })
})

describe('estadosIguales', () => {
  it('compara superficialmente clave a clave', () => {
    expect(estadosIguales({ a: 1, b: 'x' }, { a: 1, b: 'x' })).toBe(true)
    expect(estadosIguales({ a: 1, b: 'x' }, { a: 1, b: 'y' })).toBe(false)
    expect(estadosIguales({ a: 1 }, { a: 1, b: 'y' })).toBe(false)
  })
})

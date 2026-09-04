import { act, renderHook } from '@testing-library/react'
import { useUrlState } from '@/hooks/useUrlState'

const mockReplace = jest.fn()
let mockParams = new URLSearchParams()

jest.mock('next/navigation', () => ({
  useRouter: () => ({ replace: mockReplace, push: jest.fn() }),
  usePathname: () => '/vehiculos',
  useSearchParams: () => mockParams,
}))

const DEFAULTS = {
  q: '',
  estado: 'publicados' as 'publicados' | 'todos' | 'vendidos',
  pagina: 1,
}

beforeEach(() => {
  mockReplace.mockClear()
  mockParams = new URLSearchParams()
})

describe('useUrlState', () => {
  it('lee el estado inicial de la URL con coerción y defaults', () => {
    mockParams = new URLSearchParams('estado=todos&pagina=3')
    const { result } = renderHook(() => useUrlState(DEFAULTS))
    expect(result.current[0]).toEqual({ q: '', estado: 'todos', pagina: 3 })
    expect(mockReplace).not.toHaveBeenCalled()
  })

  it('setEstado actualiza el estado y hace router.replace sin scroll', () => {
    const { result } = renderHook(() => useUrlState(DEFAULTS))

    act(() => result.current[1]({ estado: 'todos', pagina: 2 }))

    expect(result.current[0]).toEqual({ q: '', estado: 'todos', pagina: 2 })
    expect(mockReplace).toHaveBeenCalledTimes(1)
    expect(mockReplace).toHaveBeenCalledWith(
      '/vehiculos?estado=todos&pagina=2',
      { scroll: false }
    )
  })

  it('omite los defaults: volver al valor inicial deja la URL limpia', () => {
    mockParams = new URLSearchParams('estado=todos')
    const { result } = renderHook(() => useUrlState(DEFAULTS))

    act(() => result.current[1]({ estado: 'publicados' }))

    expect(mockReplace).toHaveBeenCalledWith('/vehiculos', { scroll: false })
  })

  it('acepta un parche funcional y conserva los params ajenos', () => {
    mockParams = new URLSearchParams('from=dashboard&pagina=2')
    const { result } = renderHook(() => useUrlState(DEFAULTS))

    act(() => result.current[1]((prev) => ({ pagina: prev.pagina + 1 })))

    expect(result.current[0].pagina).toBe(3)
    expect(mockReplace).toHaveBeenCalledWith(
      '/vehiculos?from=dashboard&pagina=3',
      { scroll: false }
    )
  })

  it('no navega si el parche no cambia nada', () => {
    const { result } = renderHook(() => useUrlState(DEFAULTS))
    act(() => result.current[1]({ q: '' }))
    expect(mockReplace).not.toHaveBeenCalled()
  })

  it('se sincroniza cuando los params cambian desde fuera (atrás)', () => {
    const { result, rerender } = renderHook(() => useUrlState(DEFAULTS))
    expect(result.current[0].q).toBe('')

    mockParams = new URLSearchParams('q=golf&estado=vendidos')
    rerender()

    expect(result.current[0]).toEqual({
      q: 'golf',
      estado: 'vendidos',
      pagina: 1,
    })
    expect(mockReplace).not.toHaveBeenCalled()
  })

  it('ignora el eco de su propia escritura y sigue escuchando después', () => {
    const { result, rerender } = renderHook(() => useUrlState(DEFAULTS))

    act(() => result.current[1]({ q: 'golf' }))
    // Escritura intermedia ya superada: se ignora, el estado local va por delante
    act(() => result.current[1]({ q: 'golf gti' }))
    mockParams = new URLSearchParams('q=golf')
    rerender()
    expect(result.current[0].q).toBe('golf gti')

    // Aterriza la última escritura: se limpia lo pendiente sin tocar el estado
    mockParams = new URLSearchParams('q=golf+gti')
    rerender()
    expect(result.current[0].q).toBe('golf gti')
    expect(mockReplace).toHaveBeenCalledTimes(2)

    // Un cambio externo posterior sí se aplica
    mockParams = new URLSearchParams('q=polo')
    rerender()
    expect(result.current[0].q).toBe('polo')
  })

  it('si vuelve al valor de la URL con una escritura pendiente, navega igual', () => {
    mockParams = new URLSearchParams('estado=todos')
    const { result } = renderHook(() => useUrlState(DEFAULTS))

    act(() => result.current[1]({ estado: 'vendidos' }))
    act(() => result.current[1]({ estado: 'todos' }))

    expect(mockReplace).toHaveBeenCalledTimes(2)
    expect(mockReplace).toHaveBeenLastCalledWith('/vehiculos?estado=todos', {
      scroll: false,
    })
  })
})

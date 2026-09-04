import React, { useState, type ReactElement } from 'react'
import { render, screen, act, fireEvent } from '@testing-library/react'
import '@testing-library/jest-dom'
import { ToastProvider, useToast as useHookToast } from '@/hooks/useToast'
import { useToast as useComponentToast } from '@/components/Toast'
import { useSimpleToast } from '@/hooks/useSimpleToast'

/**
 * Un solo toast global. Antes había tres hooks con estado local y la mayoría
 * de las páginas nunca renderizaba el <ToastContainer /> que devolvían: los
 * mensajes (p.ej. el error al crear un cliente) no se veían. Ahora los tres
 * delegan en el ToastProvider del layout raíz sin cambiar a los consumidores.
 */

type LocalType = 'success' | 'error' | 'info'
type ToastHook = () => {
  showToast: (message: string, type?: LocalType, duration?: number) => void
  ToastContainer: () => ReactElement | null
}

const HOOKS: Array<[string, ToastHook]> = [
  ['@/components/Toast', useComponentToast],
  ['@/hooks/useToast', useHookToast],
  ['@/hooks/useSimpleToast', useSimpleToast],
]

// Consumidor "mudo": usa showToast pero NO renderiza ningún ToastContainer,
// como la mayoría de las páginas del CRM.
function MuteConsumer({
  useHook,
  message,
  type,
  duration,
}: {
  useHook: ToastHook
  message: string
  type?: LocalType
  duration?: number
}) {
  const { showToast } = useHook()
  return (
    <button type="button" onClick={() => showToast(message, type, duration)}>
      disparar {message}
    </button>
  )
}

describe('toast global', () => {
  describe.each(HOOKS)('%s dentro de <ToastProvider>', (_name, useHook) => {
    it('muestra el toast aunque el consumidor no renderice ToastContainer', async () => {
      render(
        <ToastProvider>
          <MuteConsumer useHook={useHook} message="ok" type="success" />
        </ToastProvider>
      )

      fireEvent.click(screen.getByRole('button', { name: /disparar ok/ }))

      expect(await screen.findByText('ok')).toBeInTheDocument()
    })

    it('mantiene la identidad de showToast entre renders del consumidor', () => {
      const seen: Array<(m: string) => void> = []

      function Tracker() {
        const { showToast } = useHook()
        const [, setTick] = useState(0)
        seen.push(showToast)
        return (
          <button type="button" onClick={() => setTick((t) => t + 1)}>
            rerender
          </button>
        )
      }

      render(
        <ToastProvider>
          <Tracker />
        </ToastProvider>
      )
      fireEvent.click(screen.getByRole('button', { name: 'rerender' }))
      fireEvent.click(screen.getByRole('button', { name: 'rerender' }))

      expect(seen.length).toBeGreaterThanOrEqual(3)
      expect(new Set(seen).size).toBe(1)
    })

    it('devuelve un ToastContainer estable y vacío (no duplica el global)', () => {
      const containers: Array<() => ReactElement | null> = []

      function Tracker() {
        const { ToastContainer } = useHook()
        const [, setTick] = useState(0)
        containers.push(ToastContainer)
        return (
          <>
            <ToastContainer />
            <button type="button" onClick={() => setTick((t) => t + 1)}>
              rerender
            </button>
          </>
        )
      }

      const { container } = render(
        <ToastProvider>
          <Tracker />
        </ToastProvider>
      )
      fireEvent.click(screen.getByRole('button', { name: 'rerender' }))

      expect(new Set(containers).size).toBe(1)
      // Solo el botón: el contenedor local no pinta nada.
      expect(container.querySelectorAll('div').length).toBe(0)
    })
  })

  it('el ToastProvider monta la región live en document.body', () => {
    render(
      <ToastProvider>
        <span>app</span>
      </ToastProvider>
    )
    const region = screen.getByRole('status')
    expect(region).toHaveAttribute('aria-live', 'polite')
    expect(region.parentElement).toBe(document.body)
  })

  it('genera ids distintos para toasts consecutivos (sin colisiones)', async () => {
    render(
      <ToastProvider>
        <MuteConsumer useHook={useHookToast} message="uno" />
        <MuteConsumer useHook={useHookToast} message="dos" />
      </ToastProvider>
    )
    fireEvent.click(screen.getByRole('button', { name: /disparar uno/ }))
    fireEvent.click(screen.getByRole('button', { name: /disparar dos/ }))

    expect(await screen.findByText('uno')).toBeInTheDocument()
    expect(await screen.findByText('dos')).toBeInTheDocument()
  })

  describe('sin provider', () => {
    it('useToast de @/components/Toast no lanza y su ToastContainer local muestra el toast', async () => {
      function LocalConsumer() {
        const { showToast, ToastContainer } = useComponentToast()
        return (
          <>
            <button type="button" onClick={() => showToast('local', 'info')}>
              disparar
            </button>
            <ToastContainer />
          </>
        )
      }

      expect(() => render(<LocalConsumer />)).not.toThrow()
      fireEvent.click(screen.getByRole('button', { name: 'disparar' }))

      expect(await screen.findByText('local')).toBeInTheDocument()
    })

    it('useToast de @/hooks/useToast exige el provider', () => {
      const spy = jest.spyOn(console, 'error').mockImplementation(() => {})
      try {
        expect(() =>
          render(<MuteConsumer useHook={useHookToast} message="x" />)
        ).toThrow(/ToastProvider/)
      } finally {
        spy.mockRestore()
      }
    })
  })

  describe('duraciones', () => {
    beforeEach(() => {
      jest.useFakeTimers()
    })
    afterEach(() => {
      jest.useRealTimers()
    })

    it('un error dura más que un toast normal', () => {
      render(
        <ToastProvider>
          <MuteConsumer useHook={useHookToast} message="normal" type="info" />
          <MuteConsumer useHook={useHookToast} message="fallo" type="error" />
        </ToastProvider>
      )
      fireEvent.click(screen.getByRole('button', { name: /disparar normal/ }))
      fireEvent.click(screen.getByRole('button', { name: /disparar fallo/ }))

      expect(screen.getByText('normal')).toBeInTheDocument()
      expect(screen.getByText('fallo')).toBeInTheDocument()

      act(() => {
        jest.advanceTimersByTime(3000)
      })
      expect(screen.queryByText('normal')).not.toBeInTheDocument()
      expect(screen.getByText('fallo')).toBeInTheDocument()

      act(() => {
        jest.advanceTimersByTime(2000)
      })
      expect(screen.queryByText('fallo')).not.toBeInTheDocument()
    })

    it('respeta una duración explícita', () => {
      render(
        <ToastProvider>
          <MuteConsumer
            useHook={useHookToast}
            message="breve"
            type="error"
            duration={500}
          />
        </ToastProvider>
      )
      fireEvent.click(screen.getByRole('button', { name: /disparar breve/ }))
      expect(screen.getByText('breve')).toBeInTheDocument()

      act(() => {
        jest.advanceTimersByTime(500)
      })
      expect(screen.queryByText('breve')).not.toBeInTheDocument()
    })
  })
})

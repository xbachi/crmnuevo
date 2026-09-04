'use client'

import {
  useState,
  useEffect,
  useCallback,
  useContext,
  useRef,
  type ReactElement,
} from 'react'
import { NoopContainer, ToastContext } from '@/hooks/useToast'

interface ToastProps {
  message: string
  type: 'success' | 'error' | 'info'
  duration?: number
  onClose: () => void
}

export default function Toast({
  message,
  type,
  duration = 3000,
  onClose,
}: ToastProps) {
  const [isVisible, setIsVisible] = useState(true)

  useEffect(() => {
    const timer = setTimeout(() => {
      setIsVisible(false)
      setTimeout(onClose, 300) // Esperar a que termine la animación
    }, duration)

    return () => clearTimeout(timer)
  }, [duration, onClose])

  const getToastStyles = () => {
    switch (type) {
      case 'success':
        return 'bg-green-500 text-white border-green-600'
      case 'error':
        return 'bg-red-500 text-white border-red-600'
      case 'info':
        return 'bg-blue-500 text-white border-blue-600'
      default:
        return 'bg-gray-500 text-white border-gray-600'
    }
  }

  const getIcon = () => {
    switch (type) {
      case 'success':
        return (
          <svg
            className="w-5 h-5"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M5 13l4 4L19 7"
            />
          </svg>
        )
      case 'error':
        return (
          <svg
            className="w-5 h-5"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M6 18L18 6M6 6l12 12"
            />
          </svg>
        )
      case 'info':
        return (
          <svg
            className="w-5 h-5"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
            />
          </svg>
        )
    }
  }

  return (
    <div
      role="status"
      aria-live="polite"
      className={`fixed top-4 right-4 z-50 transform transition-all duration-300 ${
        isVisible ? 'translate-x-0 opacity-100' : 'translate-x-full opacity-0'
      }`}
    >
      <div
        className={`flex items-center space-x-3 px-4 py-3 rounded-lg shadow-lg border ${getToastStyles()}`}
      >
        {getIcon()}
        <span className="font-medium">{message}</span>
        <button
          onClick={() => {
            setIsVisible(false)
            setTimeout(onClose, 300)
          }}
          className="ml-2 hover:bg-white/20 rounded-full p-1 transition-colors"
          aria-label="Cerrar"
          title="Cerrar"
        >
          <svg
            aria-hidden="true"
            className="w-4 h-4"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M6 18L18 6M6 6l12 12"
            />
          </svg>
        </button>
      </div>
    </div>
  )
}

// Hook para usar toasts
type LocalToastType = 'success' | 'error' | 'info'

export interface UseToastResult {
  showToast: (message: string, type?: LocalToastType, duration?: number) => void
  ToastContainer: () => ReactElement | null
}

/**
 * Dentro de <ToastProvider> (toda la app) delega en el toast global: el
 * `ToastContainer` devuelto es un no-op, así los consumidores que nunca lo
 * renderizaban dejan de ser mudos sin cambiar una línea. Sin provider (tests
 * aislados) conserva la implementación local con contenedor propio.
 *
 * Todos los hooks se llaman siempre, en el mismo orden: la elección se hace
 * recién al devolver.
 */
export function useToast(): UseToastResult {
  const ctx = useContext(ToastContext)
  const [toasts, setToasts] = useState<
    Array<{
      id: string
      message: string
      type: LocalToastType
      duration?: number
    }>
  >([])
  const nextId = useRef(0)

  // showToast/removeToast con identidad ESTABLE (useCallback sin deps): varias
  // páginas los usan como dependencia de useCallback/useEffect — si cambian en
  // cada render, el efecto de carga se dispara en loop infinito (bug real de
  // /expedientes: la página quedaba cargando y parpadeando para siempre).
  const showToast = useCallback(
    (message: string, type: LocalToastType = 'info', duration?: number) => {
      // Contador en ref en lugar de Date.now()/Math.random() (hidratación) y en
      // lugar de toasts.length (obligaría a depender del estado).
      nextId.current += 1
      const id = `toast-${nextId.current}`
      setToasts((prev) => [...prev, { id, message, type, duration }])
    },
    []
  )

  const removeToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((toast) => toast.id !== id))
  }, [])

  const ToastContainer = () => (
    <div className="fixed top-4 right-4 z-50 space-y-2">
      {toasts.map((toast) => (
        <Toast
          key={toast.id}
          message={toast.message}
          type={toast.type}
          duration={toast.duration}
          onClose={() => removeToast(toast.id)}
        />
      ))}
    </div>
  )

  if (ctx) {
    return { showToast: ctx.showToast, ToastContainer: NoopContainer }
  }
  return { showToast, ToastContainer }
}

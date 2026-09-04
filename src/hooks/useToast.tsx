'use client'

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { createPortal } from 'react-dom'

export type ToastType = 'success' | 'error' | 'warning' | 'info'

interface Toast {
  id: string
  message: string
  type: ToastType
  duration: number
}

export interface ToastContextType {
  showToast: (message: string, type?: ToastType, duration?: number) => void
}

export const ToastContext = createContext<ToastContextType | undefined>(
  undefined
)

const DEFAULT_DURATION = 3000
// Un error merece más tiempo de lectura que un "guardado".
const ERROR_DURATION = 5000

// Los consumidores históricos renderizan `<ToastContainer />` del hook; con el
// provider global ese contenedor ya no dibuja nada. Constante de módulo para
// que su identidad sea estable entre renders (no remonta nada).
export const NoopContainer = () => null

export function useToast() {
  const ctx = useContext(ToastContext)
  if (!ctx) {
    throw new Error('useToast must be used within a ToastProvider')
  }
  return { showToast: ctx.showToast, ToastContainer: NoopContainer }
}

interface ToastProviderProps {
  children: ReactNode
}

export function ToastProvider({ children }: ToastProviderProps) {
  const [toasts, setToasts] = useState<Toast[]>([])
  const [mounted, setMounted] = useState(false)
  const nextId = useRef(0)

  useEffect(() => {
    setMounted(true)
  }, [])

  // Identidad ESTABLE: varias páginas usan showToast como dependencia de
  // useCallback/useEffect; si cambiara en cada render dispararían loops.
  const showToast = useCallback(
    (message: string, type: ToastType = 'info', duration?: number) => {
      nextId.current += 1
      const id = `toast-${nextId.current}`
      const ms =
        duration ?? (type === 'error' ? ERROR_DURATION : DEFAULT_DURATION)

      setToasts((prev) => [...prev, { id, message, type, duration: ms }])

      setTimeout(() => {
        setToasts((prev) => prev.filter((toast) => toast.id !== id))
      }, ms)
    },
    []
  )

  const removeToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((toast) => toast.id !== id))
  }, [])

  const value = useMemo(() => ({ showToast }), [showToast])

  return (
    <ToastContext.Provider value={value}>
      {children}
      {mounted &&
        createPortal(
          <ToastContainer toasts={toasts} onRemove={removeToast} />,
          document.body
        )}
    </ToastContext.Provider>
  )
}

interface ToastContainerProps {
  toasts: Toast[]
  onRemove: (id: string) => void
}

export function ToastContainer({ toasts, onRemove }: ToastContainerProps) {
  // La región live se renderiza siempre (aun vacía) para que los lectores de
  // pantalla anuncien lo que entra después.
  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed top-4 right-4 z-50 space-y-2"
    >
      {toasts.map((toast) => (
        <ToastItem
          key={toast.id}
          toast={toast}
          onRemove={() => onRemove(toast.id)}
        />
      ))}
    </div>
  )
}

interface ToastItemProps {
  toast: Toast
  onRemove: () => void
}

function ToastItem({ toast, onRemove }: ToastItemProps) {
  const getToastStyles = (type: ToastType) => {
    switch (type) {
      case 'success':
        return 'bg-green-50 border-green-200 text-green-800'
      case 'error':
        return 'bg-red-50 border-red-200 text-red-800'
      case 'warning':
        return 'bg-yellow-50 border-yellow-200 text-yellow-800'
      case 'info':
        return 'bg-blue-50 border-blue-200 text-blue-800'
      default:
        return 'bg-gray-50 border-gray-200 text-gray-800'
    }
  }

  const getIcon = (type: ToastType) => {
    switch (type) {
      case 'success':
        return '✅'
      case 'error':
        return '❌'
      case 'warning':
        return '⚠️'
      case 'info':
        return 'ℹ️'
      default:
        return 'ℹ️'
    }
  }

  return (
    <div
      className={`
        ${getToastStyles(toast.type)}
        p-4 rounded-xl border shadow-lg
        transform transition-all duration-300 ease-in-out
        animate-slide-up max-w-sm
      `}
    >
      <div className="flex items-center space-x-3">
        <span className="text-lg">{getIcon(toast.type)}</span>
        <p className="font-medium text-sm flex-1">{toast.message}</p>
        <button
          type="button"
          onClick={onRemove}
          aria-label="Cerrar"
          className="text-gray-400 hover:text-gray-600 transition-colors"
        >
          ✕
        </button>
      </div>
    </div>
  )
}

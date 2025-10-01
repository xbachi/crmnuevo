'use client'

import { useState } from 'react'

interface Toast {
  id: string
  message: string
  type: 'success' | 'error' | 'warning' | 'info'
  duration?: number
}

export function useSimpleToast() {
  const [toasts, setToasts] = useState<Toast[]>([])

  const showToast = (
    message: string,
    type: Toast['type'] = 'info',
    duration = 3000
  ) => {
    const id = `toast-${toasts.length + 1}`
    const newToast: Toast = { id, message, type, duration }

    setToasts((prev) => [...prev, newToast])

    setTimeout(() => {
      setToasts((prev) => prev.filter((toast) => toast.id !== id))
    }, duration)
  }

  const removeToast = (id: string) => {
    setToasts((prev) => prev.filter((toast) => toast.id !== id))
  }

  const ToastContainer = () => {
    if (toasts.length === 0) return null

    return (
      <div className="fixed top-4 right-4 z-50 space-y-2">
        {toasts.map((toast) => (
          <div
            key={toast.id}
            className={`
              ${getToastStyles(toast.type)}
              p-4 rounded-xl border shadow-lg
              transform transition-all duration-300 ease-in-out
              max-w-sm
            `}
          >
            <div className="flex items-center space-x-3">
              <span className="text-lg">{getIcon(toast.type)}</span>
              <p className="font-medium text-sm flex-1">{toast.message}</p>
              <button
                onClick={() => removeToast(toast.id)}
                className="text-gray-400 hover:text-gray-600 transition-colors"
              >
                ✕
              </button>
            </div>
          </div>
        ))}
      </div>
    )
  }

  return { showToast, ToastContainer }
}

function getToastStyles(type: Toast['type']) {
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

function getIcon(type: Toast['type']) {
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

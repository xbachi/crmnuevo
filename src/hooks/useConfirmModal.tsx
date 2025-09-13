'use client'

import { createContext, useContext, useState, ReactNode } from 'react'
import { createPortal } from 'react-dom'

interface ConfirmModalOptions {
  title: string
  message: string
  confirmText?: string
  cancelText?: string
  type?: 'danger' | 'warning' | 'info'
}

interface ConfirmModalContextType {
  showConfirm: (options: ConfirmModalOptions) => Promise<boolean>
}

const ConfirmModalContext = createContext<ConfirmModalContextType | undefined>(undefined)

export function useConfirmModal() {
  const context = useContext(ConfirmModalContext)
  if (!context) {
    throw new Error('useConfirmModal must be used within a ConfirmModalProvider')
  }
  return context
}

interface ConfirmModalProviderProps {
  children: ReactNode
}

export function ConfirmModalProvider({ children }: ConfirmModalProviderProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [options, setOptions] = useState<ConfirmModalOptions | null>(null)
  const [resolvePromise, setResolvePromise] = useState<((value: boolean) => void) | null>(null)

  const showConfirm = (modalOptions: ConfirmModalOptions): Promise<boolean> => {
    return new Promise((resolve) => {
      setOptions(modalOptions)
      setResolvePromise(() => resolve)
      setIsOpen(true)
    })
  }

  const handleConfirm = () => {
    if (resolvePromise) {
      resolvePromise(true)
    }
    setIsOpen(false)
    setOptions(null)
    setResolvePromise(null)
  }

  const handleCancel = () => {
    if (resolvePromise) {
      resolvePromise(false)
    }
    setIsOpen(false)
    setOptions(null)
    setResolvePromise(null)
  }

  return (
    <ConfirmModalContext.Provider value={{ showConfirm }}>
      {children}
      {typeof window !== 'undefined' && isOpen && options && createPortal(
        <ConfirmModal
          options={options}
          onConfirm={handleConfirm}
          onCancel={handleCancel}
        />,
        document.body
      )}
    </ConfirmModalContext.Provider>
  )
}

interface ConfirmModalProps {
  options: ConfirmModalOptions
  onConfirm: () => void
  onCancel: () => void
}

function ConfirmModal({ options, onConfirm, onCancel }: ConfirmModalProps) {
  const getModalStyles = (type: ConfirmModalOptions['type']) => {
    switch (type) {
      case 'danger':
        return {
          header: 'bg-gradient-to-r from-red-500 to-red-600',
          confirmButton: 'bg-red-600 hover:bg-red-700 text-white'
        }
      case 'warning':
        return {
          header: 'bg-gradient-to-r from-yellow-500 to-yellow-600',
          confirmButton: 'bg-yellow-600 hover:bg-yellow-700 text-white'
        }
      case 'info':
        return {
          header: 'bg-gradient-to-r from-blue-500 to-blue-600',
          confirmButton: 'bg-blue-600 hover:bg-blue-700 text-white'
        }
      default:
        return {
          header: 'bg-gradient-to-r from-gray-500 to-gray-600',
          confirmButton: 'bg-gray-600 hover:bg-gray-700 text-white'
        }
    }
  }

  const styles = getModalStyles(options.type)

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full animate-scale-in">
        {/* Header */}
        <div className={`${styles.header} px-6 py-4 rounded-t-2xl`}>
          <h3 className="text-xl font-bold text-white">{options.title}</h3>
        </div>

        {/* Body */}
        <div className="p-6">
          <p className="text-gray-700 text-base leading-relaxed">
            {options.message}
          </p>
        </div>

        {/* Footer */}
        <div className="flex justify-end space-x-4 p-6 pt-0 border-t border-gray-200">
          <button
            onClick={onCancel}
            className="px-6 py-2 text-sm font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors duration-200"
          >
            {options.cancelText || 'Cancelar'}
          </button>
          <button
            onClick={onConfirm}
            className={`px-6 py-2 text-sm font-medium rounded-lg transition-colors duration-200 ${styles.confirmButton}`}
          >
            {options.confirmText || 'Confirmar'}
          </button>
        </div>
      </div>
    </div>
  )
}

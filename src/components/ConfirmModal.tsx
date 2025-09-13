'use client'

import { useState, useEffect } from 'react'

interface ConfirmModalProps {
  isOpen: boolean
  onClose: () => void
  onConfirm: () => void
  title: string
  message: string
  confirmText?: string
  cancelText?: string
  type?: 'danger' | 'warning' | 'info'
  isLoading?: boolean
}

export default function ConfirmModal({
  isOpen,
  onClose,
  onConfirm,
  title,
  message,
  confirmText = 'Confirmar',
  cancelText = 'Cancelar',
  type = 'danger',
  isLoading = false
}: ConfirmModalProps) {
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden'
    } else {
      document.body.style.overflow = 'unset'
    }

    return () => {
      document.body.style.overflow = 'unset'
    }
  }, [isOpen])

  if (!isOpen) return null

  const getTypeStyles = () => {
    switch (type) {
      case 'danger':
        return {
          icon: '⚠️',
          iconBg: 'bg-red-100',
          iconColor: 'text-red-600',
          confirmBg: 'bg-red-600 hover:bg-red-700 focus:ring-red-500',
          borderColor: 'border-red-200'
        }
      case 'warning':
        return {
          icon: '⚠️',
          iconBg: 'bg-yellow-100',
          iconColor: 'text-yellow-600',
          confirmBg: 'bg-yellow-600 hover:bg-yellow-700 focus:ring-yellow-500',
          borderColor: 'border-yellow-200'
        }
      case 'info':
        return {
          icon: 'ℹ️',
          iconBg: 'bg-blue-100',
          iconColor: 'text-blue-600',
          confirmBg: 'bg-blue-600 hover:bg-blue-700 focus:ring-blue-500',
          borderColor: 'border-blue-200'
        }
    }
  }

  const styles = getTypeStyles()

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      {/* Backdrop */}
      <div 
        className="fixed inset-0 bg-black/50 backdrop-blur-sm transition-opacity"
        onClick={onClose}
      />
      
      {/* Modal */}
      <div className="flex min-h-full items-center justify-center p-4">
        <div className="relative transform overflow-hidden rounded-2xl bg-white shadow-2xl transition-all w-full max-w-md">
          {/* Header */}
          <div className={`px-6 py-4 border-b ${styles.borderColor}`}>
            <div className="flex items-center space-x-3">
              <div className={`w-10 h-10 rounded-full flex items-center justify-center ${styles.iconBg}`}>
                <span className={`text-xl ${styles.iconColor}`}>{styles.icon}</span>
              </div>
              <div>
                <h3 className="text-lg font-semibold text-slate-800">{title}</h3>
                <p className="text-sm text-slate-500">Confirma tu acción</p>
              </div>
            </div>
          </div>

          {/* Body */}
          <div className="px-6 py-4">
            <p className="text-slate-700 leading-relaxed">{message}</p>
          </div>

          {/* Footer */}
          <div className="px-6 py-4 bg-slate-50 border-t border-slate-200 flex justify-end space-x-3">
            <button
              onClick={onClose}
              disabled={isLoading}
              className="px-4 py-2 text-slate-600 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-slate-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {cancelText}
            </button>
            <button
              onClick={onConfirm}
              disabled={isLoading}
              className={`px-4 py-2 text-white rounded-lg focus:outline-none focus:ring-2 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed transition-colors ${styles.confirmBg}`}
            >
              {isLoading ? (
                <div className="flex items-center space-x-2">
                  <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent"></div>
                  <span>Eliminando...</span>
                </div>
              ) : (
                confirmText
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// Hook para usar el modal de confirmación
export function useConfirmModal() {
  const [modalState, setModalState] = useState({
    isOpen: false,
    title: '',
    message: '',
    onConfirm: () => {},
    type: 'danger' as 'danger' | 'warning' | 'info',
    isLoading: false
  })

  const showConfirm = (
    title: string,
    message: string,
    onConfirm: () => void | Promise<void>,
    type: 'danger' | 'warning' | 'info' = 'danger'
  ) => {
    setModalState({
      isOpen: true,
      title,
      message,
      onConfirm: async () => {
        setModalState(prev => ({ ...prev, isLoading: true }))
        try {
          await onConfirm()
          setModalState(prev => ({ ...prev, isOpen: false, isLoading: false }))
        } catch (error) {
          setModalState(prev => ({ ...prev, isLoading: false }))
          throw error
        }
      },
      type,
      isLoading: false
    })
  }

  const hideConfirm = () => {
    setModalState(prev => ({ ...prev, isOpen: false, isLoading: false }))
  }

  const ConfirmModalComponent = () => (
    <ConfirmModal
      isOpen={modalState.isOpen}
      onClose={hideConfirm}
      onConfirm={modalState.onConfirm}
      title={modalState.title}
      message={modalState.message}
      type={modalState.type}
      isLoading={modalState.isLoading}
    />
  )

  return { showConfirm, ConfirmModalComponent }
}

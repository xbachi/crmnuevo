'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useInversorAuth } from '@/contexts/InversorAuthContext'

export default function InversorPortalPage() {
  const { inversor, isLoading } = useInversorAuth()
  const router = useRouter()

  useEffect(() => {
    if (!isLoading) {
      if (inversor) {
        // Si hay un inversor autenticado, redirigir a su dashboard
        router.push('/inversor-dashboard')
      } else {
        // Si no hay inversor autenticado, redirigir al login
        router.push('/inversor-login')
      }
    }
  }, [inversor, isLoading, router])

  // Mostrar loading mientras se verifica la autenticación
  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-indigo-50 to-purple-50 flex items-center justify-center">
      <div className="text-center">
        <div className="w-16 h-16 bg-gradient-to-br from-blue-600 to-purple-600 rounded-xl flex items-center justify-center mx-auto mb-4">
          <svg
            className="animate-spin w-8 h-8 text-white"
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
          >
            <circle
              className="opacity-25"
              cx="12"
              cy="12"
              r="10"
              stroke="currentColor"
              strokeWidth="4"
            ></circle>
            <path
              className="opacity-75"
              fill="currentColor"
              d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
            ></path>
          </svg>
        </div>
        <p className="text-gray-600">Redirigiendo...</p>
      </div>
    </div>
  )
}

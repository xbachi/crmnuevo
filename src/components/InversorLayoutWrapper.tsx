'use client'

import { useInversorAuth } from '@/contexts/InversorAuthContext'
import { useAuth } from '@/contexts/AuthContext'
import InversorNavigation from '@/components/InversorNavigation'

interface InversorLayoutWrapperProps {
  children: React.ReactNode
}

export default function InversorLayoutWrapper({
  children,
}: InversorLayoutWrapperProps) {
  const { inversor, isLoading } = useInversorAuth()
  // Usuario CRM = sesión real (cookie) hidratada por AuthProvider
  const { user: crmUser, isLoading: crmLoading } = useAuth()

  // Mostrar loading mientras se verifica la autenticación
  if (isLoading || crmLoading) {
    return (
      <div className="min-h-screen bg-gray-100 flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    )
  }

  // Si es usuario CRM, mostrar solo el contenido (la navegación CRM se maneja desde ConditionalLayout)
  if (crmUser) {
    return <>{children}</>
  }

  // Si hay inversor autenticado, mostrar navegación de inversor
  if (inversor) {
    return (
      <div className="flex min-h-screen">
        <InversorNavigation />
        <main className="flex-1 min-w-0 lg:ml-0">
          <div className="h-full">{children}</div>
        </main>
      </div>
    )
  }

  // Si no hay autenticación válida, mostrar solo el contenido
  return <>{children}</>
}

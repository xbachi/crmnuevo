'use client'

import { useEffect, useState } from 'react'
import { useInversorAuth } from '@/contexts/InversorAuthContext'
import { isCrmUserAuthenticated } from '@/lib/auth-utils'
import InversorNavigation from '@/components/InversorNavigation'

interface InversorLayoutWrapperProps {
  children: React.ReactNode
}

export default function InversorLayoutWrapper({
  children,
}: InversorLayoutWrapperProps) {
  const { inversor, isLoading } = useInversorAuth()
  const [isCrmUser, setIsCrmUser] = useState<boolean | null>(null)
  const [authChecked, setAuthChecked] = useState(false)

  useEffect(() => {
    const checkAuth = () => {
      const crmAuth = isCrmUserAuthenticated()
      setIsCrmUser(crmAuth)
      setAuthChecked(true)
    }
    const timer = setTimeout(checkAuth, 100)
    return () => clearTimeout(timer)
  }, [])

  // Mostrar loading mientras se verifica la autenticación
  if (isLoading || !authChecked) {
    return (
      <div className="min-h-screen bg-gray-100 flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    )
  }

  // Si es usuario CRM, mostrar solo el contenido (la navegación CRM se maneja desde ConditionalLayout)
  if (isCrmUser) {
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

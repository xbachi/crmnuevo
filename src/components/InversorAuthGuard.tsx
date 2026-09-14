'use client'

import { useEffect } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import { useInversorAuth } from '@/contexts/InversorAuthContext'
import { useAuth } from '@/contexts/AuthContext'

interface InversorAuthGuardProps {
  children: React.ReactNode
}

export default function InversorAuthGuard({
  children,
}: InversorAuthGuardProps) {
  const { inversor, isLoading } = useInversorAuth()
  // Usuario CRM = sesión real (cookie) hidratada por AuthProvider
  const { user: crmUser, isLoading: crmLoading } = useAuth()
  const router = useRouter()
  const pathname = usePathname()
  const isCrmUser = !!crmUser
  const authChecked = !crmLoading

  useEffect(() => {
    // Solo ejecutar la lógica de redirección cuando tengamos toda la información
    if (isLoading || !authChecked) {
      return
    }

    // Si es usuario CRM, permitir acceso completo
    if (isCrmUser) {
      return
    }

    // Si no es usuario CRM y no hay inversor autenticado, redirigir al login de inversores
    if (!inversor && !isCrmUser) {
      console.log(
        'No hay autenticación válida, redirigiendo al login de inversores'
      )
      router.push('/logininv')
    }
  }, [inversor, isLoading, isCrmUser, authChecked, router, pathname])

  // Mostrar loading mientras se verifica la autenticación
  if (isLoading || !authChecked) {
    return (
      <div className="min-h-screen bg-gray-100 flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    )
  }

  // Si es usuario CRM, mostrar contenido con navegación CRM
  if (isCrmUser) {
    return <>{children}</>
  }

  // Si hay inversor autenticado, mostrar contenido con navegación de inversor
  if (inversor) {
    return <>{children}</>
  }

  // Si no hay autenticación válida, no mostrar nada (se redirigirá)
  return null
}

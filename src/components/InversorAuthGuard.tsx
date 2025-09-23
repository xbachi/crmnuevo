'use client'

import { useEffect, useState } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import { useInversorAuth } from '@/contexts/InversorAuthContext'
import { isCrmUserAuthenticated } from '@/lib/auth-utils'

interface InversorAuthGuardProps {
  children: React.ReactNode
}

export default function InversorAuthGuard({
  children,
}: InversorAuthGuardProps) {
  const { inversor, isLoading } = useInversorAuth()
  const router = useRouter()
  const pathname = usePathname()
  const [isCrmUser, setIsCrmUser] = useState<boolean | null>(null)
  const [authChecked, setAuthChecked] = useState(false)

  useEffect(() => {
    // Verificar autenticación CRM
    const checkAuth = () => {
      const crmAuth = isCrmUserAuthenticated()
      setIsCrmUser(crmAuth)
      setAuthChecked(true)
    }

    // Pequeño delay para asegurar que el DOM esté listo
    const timer = setTimeout(checkAuth, 100)

    return () => clearTimeout(timer)
  }, [])

  useEffect(() => {
    // Solo ejecutar la lógica de redirección cuando tengamos toda la información
    if (isLoading || !authChecked) {
      return
    }

    // Si es usuario CRM, permitir acceso completo
    if (isCrmUser) {
      console.log('Usuario CRM detectado, permitiendo acceso completo')
      return
    }

    // Si no es usuario CRM y no hay inversor autenticado, redirigir al login de inversores
    if (!inversor && !isCrmUser) {
      console.log(
        'No hay autenticación válida, redirigiendo al login de inversores'
      )
      router.push('/logininv')
    }
  }, [inversor, isLoading, isCrmUser, authChecked, router])

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

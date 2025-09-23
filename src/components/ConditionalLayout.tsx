'use client'

import { usePathname } from 'next/navigation'
import { useState, useEffect } from 'react'
import Navigation from '@/components/Navigation'
import { isCrmUserAuthenticated } from '@/lib/auth-utils'

interface ConditionalLayoutProps {
  children: React.ReactNode
}

export default function ConditionalLayout({
  children,
}: ConditionalLayoutProps) {
  const pathname = usePathname()
  const [isCrmUser, setIsCrmUser] = useState<boolean | null>(null)
  const [isClient, setIsClient] = useState(false)

  // Páginas que no deben mostrar la navegación
  const authPages = ['/login', '/logininv']

  useEffect(() => {
    setIsClient(true)
    setIsCrmUser(isCrmUserAuthenticated())
  }, [])

  if (authPages.includes(pathname)) {
    // Para páginas de autenticación, solo mostrar el contenido
    return <>{children}</>
  }

  // Durante la hidratación, mostrar un estado de carga consistente
  if (!isClient || isCrmUser === null) {
    return (
      <div className="min-h-screen bg-gray-100 flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    )
  }

  if (isCrmUser) {
    // Si es usuario CRM, mostrar navegación CRM en TODAS las páginas
    return (
      <div className="flex min-h-screen">
        <Navigation />
        <main className="flex-1 min-w-0 lg:ml-0">
          <div className="h-full">{children}</div>
        </main>
      </div>
    )
  }

  // Si no es usuario CRM, solo mostrar el contenido
  // La navegación se maneja desde InversorLayoutWrapper para inversores
  return <>{children}</>
}

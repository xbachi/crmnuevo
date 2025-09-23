'use client'

import { usePathname } from 'next/navigation'
import Navigation from '@/components/Navigation'

interface ConditionalLayoutProps {
  children: React.ReactNode
}

export default function ConditionalLayout({
  children,
}: ConditionalLayoutProps) {
  const pathname = usePathname()

  // Páginas que no deben mostrar la navegación
  const authPages = ['/login', '/logininv']
  const inversorPages = pathname.startsWith('/inversores/')
  const shouldShowNavigation = !authPages.includes(pathname) && !inversorPages

  if (!shouldShowNavigation) {
    // Para páginas de autenticación, solo mostrar el contenido
    return <>{children}</>
  }

  // Para páginas principales, mostrar con navegación
  return (
    <div className="flex min-h-screen">
      <Navigation />
      <main className="flex-1 min-w-0 lg:ml-0">
        <div className="h-full">{children}</div>
      </main>
    </div>
  )
}

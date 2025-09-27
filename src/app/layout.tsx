'use client'

import type { Metadata } from 'next'
import './globals.css'
import Navigation from '@/components/Navigation'
import { ToastProvider } from '@/hooks/useToast'
import { AuthProvider } from '@/contexts/AuthContext'
import { InversorAuthProvider } from '@/contexts/InversorAuthContext'
import { CacheProvider } from '@/contexts/CacheContext'
import ConditionalLayout from '@/components/ConditionalLayout'
import { useEffect } from 'react'

export const metadata: Metadata = {
  title: 'SevenCars CRM',
  description: 'Sistema de gestión de vehículos - SevenCars CRM Platform',
}

// Componente para manejar la hidratación
function HydrationHandler({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    // Limpiar atributos de extensiones del navegador que causan errores de hidratación
    const cleanBrowserExtensionAttributes = () => {
      const elements = document.querySelectorAll(
        '[bis_skin_checked], [data-lastpass-icon-root], [data-grammarly-shadow-root]'
      )
      elements.forEach((element) => {
        element.removeAttribute('bis_skin_checked')
        element.removeAttribute('data-lastpass-icon-root')
        element.removeAttribute('data-grammarly-shadow-root')
      })
    }

    // Limpiar inmediatamente y después de un delay
    cleanBrowserExtensionAttributes()
    const timeout = setTimeout(cleanBrowserExtensionAttributes, 100)

    return () => clearTimeout(timeout)
  }, [])

  return <>{children}</>
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="es" suppressHydrationWarning>
      <body className="antialiased bg-white" suppressHydrationWarning>
        <HydrationHandler>
          <AuthProvider>
            <CacheProvider>
              <ToastProvider>
                <ConditionalLayout>{children}</ConditionalLayout>
              </ToastProvider>
            </CacheProvider>
          </AuthProvider>
        </HydrationHandler>
      </body>
    </html>
  )
}

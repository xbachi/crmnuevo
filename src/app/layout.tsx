import type { Metadata } from 'next'
import './globals.css'
import Navigation from '@/components/Navigation'
import { ToastProvider } from '@/hooks/useToast'
import { AuthProvider } from '@/contexts/AuthContext'
import { InversorAuthProvider } from '@/contexts/InversorAuthContext'
import { CacheProvider } from '@/contexts/CacheContext'
import ConditionalLayout from '@/components/ConditionalLayout'
import HydrationHandler from '@/components/HydrationHandler'

export const metadata: Metadata = {
  title: 'SevenCars CRM',
  description: 'Sistema de gestión de vehículos - SevenCars CRM Platform',
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

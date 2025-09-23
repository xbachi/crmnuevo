import type { Metadata } from 'next'
import './globals.css'
import { ToastProvider } from '@/hooks/useToast'
import { AuthProvider } from '@/contexts/AuthContext'

export const metadata: Metadata = {
  title: 'SevenCars CRM - Login',
  description: 'Sistema de gestión de vehículos - SevenCars CRM Platform',
}

export default function AuthLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="es" suppressHydrationWarning>
      <body className="antialiased bg-white" suppressHydrationWarning>
        <AuthProvider>
          <ToastProvider>{children}</ToastProvider>
        </AuthProvider>
      </body>
    </html>
  )
}

import type { Metadata } from 'next'
import '../globals.css'
import { ToastProvider } from '@/hooks/useToast'
import { InversorAuthProvider } from '@/contexts/InversorAuthContext'

export const metadata: Metadata = {
  title: 'Portal de Inversores - SevenCars',
  description: 'Portal de acceso para inversores - SevenCars Motors',
}

export default function InversorLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="es" suppressHydrationWarning>
      <body className="antialiased bg-white" suppressHydrationWarning>
        <InversorAuthProvider>
          <ToastProvider>
            <div className="min-h-screen">{children}</div>
          </ToastProvider>
        </InversorAuthProvider>
      </body>
    </html>
  )
}

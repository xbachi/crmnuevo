'use client'

import { useEffect } from 'react'

interface HydrationHandlerProps {
  children: React.ReactNode
}

export default function HydrationHandler({ children }: HydrationHandlerProps) {
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

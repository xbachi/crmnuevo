'use client'

import { useEffect } from 'react'

/** Marca el presupuesto como visto una vez por sesión de navegador. */
export default function MarcarVisto({ token }: { token: string }) {
  useEffect(() => {
    const clave = `presupuesto-visto:${token}`
    try {
      if (sessionStorage.getItem(clave)) return
    } catch {
      // sessionStorage bloqueado: se marca igualmente
    }
    fetch(`/api/public/presupuesto/${encodeURIComponent(token)}/visto`, {
      method: 'POST',
      keepalive: true,
    })
      .then(() => {
        try {
          sessionStorage.setItem(clave, '1')
        } catch {
          // sin storage: nada que guardar
        }
      })
      .catch(() => {
        // best-effort: el estado "visto" no bloquea la lectura
      })
  }, [token])
  return null
}

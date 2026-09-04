'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import {
  escribirEstadoEnParams,
  estadosIguales,
  leerEstadoDeParams,
  type UrlStateDefaults,
} from '@/lib/urlState'

export type SetUrlState<T> = (
  parche: Partial<T> | ((prev: T) => Partial<T>)
) => void

/**
 * Estado de lista sincronizado con la query string. `setEstado` hace
 * `router.replace` (sin añadir entradas al historial) y el estado se vuelve a
 * leer cuando los params cambian desde fuera (atrás/adelante, enlace).
 *
 * Sin debounce: cada página lo aplica en su input de búsqueda antes de llamar
 * a `setEstado`. La página que lo usa debe ir dentro de un `<Suspense>`.
 */
export function useUrlState<T extends UrlStateDefaults>(
  defaults: T
): [T, SetUrlState<T>] {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()

  const defaultsRef = useRef(defaults)
  const [estado, setLocal] = useState<T>(() =>
    leerEstadoDeParams(searchParams, defaultsRef.current)
  )
  const estadoRef = useRef(estado)
  const paramsRef = useRef(searchParams)
  // Query que escribimos y todavía no vimos reflejada en useSearchParams():
  // mientras esté pendiente, los cambios de params son ecos propios, no externos.
  const pendienteRef = useRef<string | null>(null)

  useEffect(() => {
    paramsRef.current = searchParams
    const qs = searchParams.toString()
    if (pendienteRef.current !== null) {
      if (qs === pendienteRef.current) pendienteRef.current = null
      return
    }
    const desdeUrl = leerEstadoDeParams(searchParams, defaultsRef.current)
    if (!estadosIguales(estadoRef.current, desdeUrl)) {
      estadoRef.current = desdeUrl
      setLocal(desdeUrl)
    }
  }, [searchParams])

  const setEstado = useCallback<SetUrlState<T>>(
    (parche) => {
      const prev = estadoRef.current
      const parcial = typeof parche === 'function' ? parche(prev) : parche
      const siguiente = { ...prev, ...parcial }
      if (estadosIguales(prev, siguiente)) return
      estadoRef.current = siguiente
      setLocal(siguiente)

      const qs = escribirEstadoEnParams(
        paramsRef.current,
        siguiente,
        defaultsRef.current
      ).toString()
      // Si no hay nada pendiente y la URL ya es esa, no hace falta navegar.
      if (pendienteRef.current === null && qs === paramsRef.current.toString())
        return
      pendienteRef.current = qs
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false })
    },
    [router, pathname]
  )

  return [estado, setEstado]
}

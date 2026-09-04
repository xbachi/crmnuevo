/**
 * Piezas mínimas para errores por campo en formularios: mensaje bajo el input,
 * asterisco de obligatorio accesible y clases del input con borde rojo.
 * El look base lo aporta cada formulario (`claseInput(error, baseDelForm)`).
 */

interface CampoErrorProps {
  mensaje?: string
  /** Para enlazarlo con `aria-describedby` del input. */
  id?: string
}

export function CampoError({ mensaje, id }: CampoErrorProps) {
  if (!mensaje) return null
  return (
    <p id={id} role="alert" className="mt-1 text-xs text-red-600">
      {mensaje}
    </p>
  )
}

export function Obligatorio() {
  return (
    <>
      <span aria-hidden="true" className="text-red-500">
        {' '}
        *
      </span>
      <span className="sr-only"> obligatorio</span>
    </>
  )
}

export const CLASE_INPUT_BASE =
  'w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-green-500 focus:border-green-500 transition-colors'

// Clases de color de borde/anillo que se sustituyen cuando hay error.
const RE_CLASE_COLOR =
  /^(focus:)?border-(gray|slate|green|blue|red)-\d+$|^focus:border-transparent$|^focus:ring-(gray|slate|green|blue|red)-\d+$/

/** Mismas clases del input, con borde y anillo rojos si hay error. */
export function claseInput(
  error?: string,
  base: string = CLASE_INPUT_BASE
): string {
  if (!error) return base
  const sinColor = base
    .split(/\s+/)
    .filter((c) => c && !RE_CLASE_COLOR.test(c))
    .join(' ')
  return `${sinColor} border-red-500 focus:ring-red-500 focus:border-red-500`
}

/** Scroll + focus al primer campo con error. Requiere que el input tenga `id` = nombre del campo. */
export function enfocarCampo(id: string | null): void {
  if (!id || typeof document === 'undefined') return
  const el = document.getElementById(id)
  if (!el) return
  if (typeof el.scrollIntoView === 'function') {
    el.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }
  el.focus({ preventScroll: true })
}

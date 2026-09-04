'use client'

import Link from 'next/link'
import { normalizarDealEstado } from '@/lib/dealEstado'

export interface CambioNombreEstado {
  solicitado: boolean
  documentacionRecibida: boolean
  clienteAvisado: boolean
  documentacionRetirada: boolean
}

export interface SiguientePasoInput {
  estado: string | null | undefined
  tieneContratoReserva: boolean
  tieneContratoVenta: boolean
  tieneFacturaActiva: boolean
  fechaReservaExpira: string | Date | null | undefined
  cambioNombre: CambioNombreEstado
  /** `false` → falta el mandato de gestoría (sub-paso previo al cambio de
   *  nombre); `undefined` → no se evalúa. */
  tieneMandatoGestoria?: boolean
  /** Inyectable para tests; por defecto `new Date()`. */
  hoy?: Date
}

export interface SiguientePasoAlerta {
  tipo: 'warning' | 'danger'
  texto: string
}

export interface SiguientePaso {
  /** 1..5; 0 si la venta está anulada. */
  paso: number
  total: 5
  titulo: string
  descripcion: string
  ctaLabel: string | null
  anchorId: string | null
  alerta?: SiguientePasoAlerta
}

export const DEAL_ANCHOR_DOCUMENTOS = 'deal-documentos'
export const DEAL_ANCHOR_FACTURACION = 'deal-facturacion'
export const DEAL_ANCHOR_CAMBIO_NOMBRE = 'deal-cambio-nombre'

/**
 * Etiquetas del stepper. Generar el contrato de venta y pasar a `vendido`
 * son una sola acción, así que no hay paso "Venta" separado.
 */
export const PASOS_LABEL = [
  'Reserva',
  'Contrato de venta',
  'Factura',
  'Cambio de nombre',
  'Completada',
] as const

const CAMBIO_NOMBRE_ORDEN: Array<{
  key: keyof CambioNombreEstado
  label: string
}> = [
  { key: 'solicitado', label: 'Cambio de nombre solicitado' },
  { key: 'documentacionRecibida', label: 'Documentación recibida' },
  { key: 'clienteAvisado', label: 'Cliente avisado' },
  { key: 'documentacionRetirada', label: 'Documentación retirada' },
]

const DIA_MS = 86_400_000

/** Días de calendario entre hoy y la fecha (negativo si ya pasó). */
function diasHasta(fecha: string | Date, hoy: Date): number | null {
  const f = new Date(fecha)
  if (isNaN(f.getTime())) return null
  const a = new Date(f.getFullYear(), f.getMonth(), f.getDate()).getTime()
  const b = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate()).getTime()
  return Math.round((a - b) / DIA_MS)
}

const plural = (n: number) => (n === 1 ? 'día' : 'días')

export function calcularSiguientePaso(
  input: SiguientePasoInput
): SiguientePaso {
  const estado = normalizarDealEstado(input.estado)
  const hoy = input.hoy ?? new Date()
  const total = 5 as const

  if (estado === 'anulado') {
    return {
      paso: 0,
      total,
      titulo: 'Venta anulada',
      descripcion: 'Este deal está anulado: no hay pasos pendientes.',
      ctaLabel: null,
      anchorId: null,
    }
  }

  const enCambioNombre =
    estado === 'facturado' || (estado === 'vendido' && input.tieneFacturaActiva)
  if (enCambioNombre) {
    const hechos = CAMBIO_NOMBRE_ORDEN.filter(
      (p) => input.cambioNombre[p.key]
    ).length
    const pendiente = CAMBIO_NOMBRE_ORDEN.find(
      (p) => !input.cambioNombre[p.key]
    )
    if (!pendiente) {
      return {
        paso: 5,
        total,
        titulo: 'Venta completada',
        descripcion: 'Factura emitida y cambio de nombre terminado.',
        ctaLabel: null,
        anchorId: null,
      }
    }
    const siguiente = pendiente.label.toLowerCase()
    return {
      paso: 4,
      total,
      titulo: `Cambio de nombre: ${hechos} de 4 pasos`,
      descripcion:
        input.tieneMandatoGestoria === false
          ? `Genera el mandato de gestoría · después: ${siguiente}`
          : `Siguiente: ${siguiente}`,
      ctaLabel: 'Ir al cambio de nombre',
      anchorId: DEAL_ANCHOR_CAMBIO_NOMBRE,
    }
  }

  if (estado === 'vendido') {
    return {
      paso: 3,
      total,
      titulo: 'Emitir la factura',
      descripcion:
        'El contrato de venta está generado; falta emitir la factura.',
      ctaLabel: 'Ir a facturación',
      anchorId: DEAL_ANCHOR_FACTURACION,
    }
  }

  const enReserva =
    estado === 'reservado' || (estado === 'nuevo' && input.tieneContratoReserva)
  if (enReserva) {
    let descripcion =
      'Con el contrato de reserva generado, el siguiente documento es el contrato de venta.'
    let alerta: SiguientePasoAlerta | undefined
    if (!input.tieneContratoReserva) {
      alerta = {
        tipo: 'warning',
        texto:
          'El deal figura reservado pero no tiene contrato de reserva generado.',
      }
    }
    if (input.fechaReservaExpira) {
      const dias = diasHasta(input.fechaReservaExpira, hoy)
      if (dias !== null && dias < 0) {
        alerta = {
          tipo: 'danger',
          texto: `Reserva vencida hace ${-dias} ${plural(-dias)}`,
        }
      } else if (dias === 0) {
        descripcion = 'La reserva vence hoy'
        alerta = alerta ?? { tipo: 'warning', texto: 'La reserva vence hoy' }
      } else if (dias !== null) {
        descripcion = `La reserva vence en ${dias} ${plural(dias)}`
      }
    }
    return {
      paso: 2,
      total,
      titulo: 'Generar el contrato de venta',
      descripcion,
      ctaLabel: 'Ir a documentos',
      anchorId: DEAL_ANCHOR_DOCUMENTOS,
      ...(alerta ? { alerta } : {}),
    }
  }

  return {
    paso: 1,
    total,
    titulo: 'Generar el contrato de reserva',
    descripcion:
      'Primer documento del flujo de venta: reserva el vehículo para este cliente.',
    ctaLabel: 'Ir a documentos',
    anchorId: DEAL_ANCHOR_DOCUMENTOS,
  }
}

const ALERTA_CLASS: Record<SiguientePasoAlerta['tipo'], string> = {
  warning: 'bg-yellow-50 text-yellow-800 border-yellow-200',
  danger: 'bg-red-50 text-red-800 border-red-200',
}

export default function DealNextStep(props: SiguientePasoInput) {
  const r = calcularSiguientePaso(props)
  const anulado = r.paso === 0

  const irA = () => {
    if (!r.anchorId) return
    document
      .getElementById(r.anchorId)
      ?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  const cabecera = anulado
    ? 'Estado'
    : r.paso === r.total
      ? 'Flujo de venta'
      : `Siguiente paso · ${r.paso} de ${r.total}`

  return (
    <section
      className="bg-white rounded-xl shadow-sm border border-slate-200 p-4 sm:p-5"
      aria-label="Siguiente paso de la venta"
    >
      <ol className="flex items-center gap-1 overflow-x-auto pb-3 mb-3 border-b border-slate-100">
        {PASOS_LABEL.map((label, i) => {
          const n = i + 1
          const hecho = !anulado && n < r.paso
          const actual = !anulado && n === r.paso
          const circulo = hecho
            ? 'bg-green-600 text-white'
            : actual
              ? 'bg-blue-600 text-white ring-4 ring-blue-100'
              : 'bg-gray-100 text-gray-500'
          const texto = actual
            ? 'font-semibold text-gray-900'
            : hecho
              ? 'text-gray-700'
              : 'text-gray-400'
          return (
            <li
              key={label}
              className="flex items-center gap-2 shrink-0"
              aria-current={actual ? 'step' : undefined}
            >
              <span
                className={`flex h-6 w-6 items-center justify-center rounded-full text-xs font-semibold ${circulo}`}
              >
                {hecho ? '✓' : n}
              </span>
              <span className={`text-xs sm:text-sm ${texto}`}>{label}</span>
              {i < PASOS_LABEL.length - 1 && (
                <span
                  className="mx-1 h-px w-4 sm:w-8 bg-gray-200"
                  aria-hidden="true"
                />
              )}
            </li>
          )
        })}
      </ol>

      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs uppercase tracking-wide text-gray-500">
            {cabecera}
          </p>
          <p className="text-base font-semibold text-gray-900">{r.titulo}</p>
          <p className="text-sm text-gray-600">{r.descripcion}</p>
          {r.alerta && (
            <p
              className={`mt-2 inline-block rounded-md border px-2 py-1 text-sm font-medium ${ALERTA_CLASS[r.alerta.tipo]}`}
              role={r.alerta.tipo === 'danger' ? 'alert' : undefined}
            >
              {r.alerta.texto}
            </p>
          )}
          {r.paso === r.total && (
            <p className="mt-1 text-sm text-gray-500">
              <Link
                href="/expedientes"
                className="text-blue-600 hover:underline"
              >
                Ver expedientes
              </Link>
              {' · '}
              <Link
                href="/comisiones"
                className="text-blue-600 hover:underline"
              >
                Ver comisiones
              </Link>
            </p>
          )}
        </div>
        {r.ctaLabel && r.anchorId && (
          <button
            type="button"
            onClick={irA}
            className="shrink-0 px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 transition-colors"
          >
            {r.ctaLabel}
          </button>
        )}
      </div>
    </section>
  )
}

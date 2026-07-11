'use client'

import { useState, useEffect, useCallback } from 'react'
import ProtectedRoute from '@/components/ProtectedRoute'
import { useToast } from '@/components/Toast'
import {
  ESTADOS_EXPEDIENTE,
  TIPO_OPERACION_LABEL,
  faltanRequeridos,
  type ChecklistItem,
  type EstadoExpediente,
  type TipoOperacion,
} from '@/lib/expedienteChecklist'

interface Expediente {
  id: number
  tipo_operacion: TipoOperacion
  deal_id: number | null
  b2b_venta_id: number | null
  vehiculo_id: number | null
  matricula: string | null
  numero_factura: string | null
  invoice_date: string | null
  estado: EstadoExpediente
  checklist: ChecklistItem[]
  notas: string | null
}

interface ApiResponse {
  verificable: boolean
  nota?: string
  total: number
  counts: Record<string, number>
  expedientes: Expediente[]
}

const ESTADO_BADGE: Record<EstadoExpediente, string> = {
  incompleto: 'bg-red-100 text-red-700',
  completo: 'bg-green-100 text-green-700',
  enviado: 'bg-blue-100 text-blue-700',
  confirmado: 'bg-emerald-100 text-emerald-800',
}

const currentQuarter = () => Math.floor(new Date().getMonth() / 3) + 1

export default function ExpedientesPage() {
  const [data, setData] = useState<ApiResponse | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [year, setYear] = useState(new Date().getFullYear())
  const [quarter, setQuarter] = useState<number | 'todos'>(currentQuarter())
  const [estadoFilter, setEstadoFilter] = useState<string>('')
  const [expandedId, setExpandedId] = useState<number | null>(null)
  const [savingKey, setSavingKey] = useState<string | null>(null)
  const { showToast } = useToast()

  const fetchExpedientes = useCallback(async () => {
    setIsLoading(true)
    try {
      const params = new URLSearchParams({ year: String(year) })
      if (quarter !== 'todos') params.set('quarter', String(quarter))
      if (estadoFilter) params.set('estado', estadoFilter)
      const res = await fetch(`/api/expedientes?${params}`)
      if (!res.ok) throw new Error('Error al cargar expedientes')
      setData((await res.json()) as ApiResponse)
    } catch (err) {
      console.error(err)
      showToast('Error al cargar los expedientes', 'error')
    } finally {
      setIsLoading(false)
    }
  }, [year, quarter, estadoFilter, showToast])

  useEffect(() => {
    fetchExpedientes()
  }, [fetchExpedientes])

  const patchExpediente = async (
    id: number,
    body: Record<string, unknown>,
    saveKey: string
  ) => {
    setSavingKey(saveKey)
    try {
      const res = await fetch(`/api/expedientes/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const payload = await res.json().catch(() => ({}))
      if (res.status === 422) {
        showToast(
          `${payload.error}. Faltan: ${(payload.faltantes ?? []).join(', ')}`,
          'error'
        )
        return
      }
      if (!res.ok) {
        showToast(payload.error || 'Error al actualizar el expediente', 'error')
        return
      }
      await fetchExpedientes()
    } catch (err) {
      console.error(err)
      showToast('Error al actualizar el expediente', 'error')
    } finally {
      setSavingKey(null)
    }
  }

  const counts = data?.counts ?? {}
  const total = data?.total ?? 0
  const incompletos = counts.incompleto ?? 0
  const expedientes = data?.expedientes ?? []

  return (
    <ProtectedRoute>
      <div className="min-h-screen bg-gray-50">
        <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
          {/* Header */}
          <div className="bg-gradient-to-r from-slate-800 to-slate-700 rounded-xl shadow-lg p-4 sm:p-6">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
              <div>
                <h1 className="text-lg sm:text-xl font-bold text-white">
                  Expedientes de venta
                </h1>
                <p className="text-slate-300 text-xs sm:text-sm">
                  {incompletos > 0
                    ? `${incompletos} incompletos de ${total} en el período`
                    : `${total} expedientes, todos con documentación completa`}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {ESTADOS_EXPEDIENTE.map((e) => (
                  <span
                    key={e}
                    className={`px-2 py-1 rounded-full text-xs font-bold ${ESTADO_BADGE[e]}`}
                  >
                    {e}: {counts[e] ?? 0}
                  </span>
                ))}
              </div>
            </div>
          </div>

          {/* Filtros */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4 flex flex-wrap items-center gap-4">
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium text-gray-600">Trimestre:</span>
              <div className="flex bg-gray-100 rounded-lg p-1">
                {[1, 2, 3, 4, 'todos' as const].map((q) => (
                  <button
                    key={q}
                    onClick={() => setQuarter(q)}
                    className={`px-3 py-1.5 rounded-md text-xs sm:text-sm font-medium transition-all ${
                      quarter === q
                        ? 'bg-white text-gray-800 shadow-sm'
                        : 'text-gray-600 hover:text-gray-800'
                    }`}
                  >
                    {q === 'todos' ? 'Año' : `${q}T`}
                  </button>
                ))}
              </div>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium text-gray-600">Año:</span>
              <select
                value={year}
                onChange={(e) => setYear(parseInt(e.target.value, 10))}
                className="text-sm border border-gray-300 rounded-lg px-2 py-1.5 focus:ring-2 focus:ring-blue-500"
              >
                {[2025, 2026, 2027].map((y) => (
                  <option key={y} value={y}>
                    {y}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium text-gray-600">Estado:</span>
              <select
                value={estadoFilter}
                onChange={(e) => setEstadoFilter(e.target.value)}
                className="text-sm border border-gray-300 rounded-lg px-2 py-1.5 focus:ring-2 focus:ring-blue-500"
              >
                <option value="">Todos</option>
                {ESTADOS_EXPEDIENTE.map((e) => (
                  <option key={e} value={e}>
                    {e}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Contenido */}
          {isLoading ? (
            <div className="text-center py-12">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
              <p className="mt-4 text-gray-600">Cargando expedientes...</p>
            </div>
          ) : data && !data.verificable ? (
            <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-6 text-sm text-yellow-800">
              {data.nota ?? 'La tabla de expedientes no existe todavía.'}
            </div>
          ) : expedientes.length === 0 ? (
            <div className="bg-white rounded-xl shadow-md border border-gray-200 p-8 text-center text-gray-500 text-sm">
              No hay expedientes en el período seleccionado.
            </div>
          ) : (
            <div className="bg-white rounded-xl shadow-md border border-gray-200 overflow-hidden">
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-3 sm:px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Factura
                      </th>
                      <th className="px-3 sm:px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Coche / Matrícula
                      </th>
                      <th className="px-3 sm:px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Operación
                      </th>
                      <th className="px-3 sm:px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Checklist
                      </th>
                      <th className="px-3 sm:px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Estado
                      </th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {expedientes.map((exp) => (
                      <ExpedienteRow
                        key={exp.id}
                        exp={exp}
                        expanded={expandedId === exp.id}
                        onToggle={() =>
                          setExpandedId(expandedId === exp.id ? null : exp.id)
                        }
                        onPatch={patchExpediente}
                        savingKey={savingKey}
                      />
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </main>
      </div>
    </ProtectedRoute>
  )
}

function ExpedienteRow({
  exp,
  expanded,
  onToggle,
  onPatch,
  savingKey,
}: {
  exp: Expediente
  expanded: boolean
  onToggle: () => void
  onPatch: (id: number, body: Record<string, unknown>, saveKey: string) => void
  savingKey: string | null
}) {
  const checklist = exp.checklist ?? []
  const faltantes = faltanRequeridos(checklist)

  return (
    <>
      <tr className="hover:bg-gray-50 cursor-pointer" onClick={onToggle}>
        <td className="px-3 sm:px-6 py-4 whitespace-nowrap">
          <div className="text-sm font-medium text-gray-900">
            {exp.numero_factura ?? '—'}
          </div>
          <div className="text-xs text-gray-500">{exp.invoice_date ?? ''}</div>
        </td>
        <td className="px-3 sm:px-6 py-4 whitespace-nowrap">
          <div className="text-sm text-gray-900">{exp.matricula ?? '—'}</div>
        </td>
        <td className="px-3 sm:px-6 py-4 whitespace-nowrap">
          <span className="px-2 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-700">
            {TIPO_OPERACION_LABEL[exp.tipo_operacion] ?? exp.tipo_operacion}
          </span>
        </td>
        <td className="px-3 sm:px-6 py-4">
          <div className="flex flex-wrap gap-1">
            {checklist.map((item) => (
              <span
                key={item.clave}
                title={`${item.label}${item.requerido ? ' (requerido)' : ' (opcional)'}`}
                className={`px-2 py-1 rounded-full text-xs font-medium ${
                  item.presente
                    ? 'bg-green-100 text-green-700'
                    : item.requerido
                      ? 'bg-red-100 text-red-700'
                      : 'bg-gray-100 text-gray-500'
                }`}
              >
                {item.presente ? '✓' : '✗'} {item.label}
              </span>
            ))}
          </div>
        </td>
        <td className="px-3 sm:px-6 py-4 whitespace-nowrap">
          <span
            className={`px-2 py-1 rounded-full text-xs font-bold ${ESTADO_BADGE[exp.estado]}`}
          >
            {exp.estado}
          </span>
        </td>
      </tr>
      {expanded && (
        <tr className="bg-gray-50">
          <td colSpan={5} className="px-3 sm:px-6 py-4">
            <div className="space-y-3">
              <div className="text-xs text-gray-500">
                Marcá a mano los documentos verificados. Los que la
                automatización ya confirmó vienen marcados solos.
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                {checklist.map((item) => {
                  const key = `${exp.id}:${item.clave}`
                  return (
                    <label
                      key={item.clave}
                      className="flex items-center gap-2 bg-white border border-gray-200 rounded-lg px-3 py-2 text-sm cursor-pointer hover:bg-gray-50"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <input
                        type="checkbox"
                        checked={item.presente}
                        disabled={savingKey === key}
                        onChange={(e) =>
                          onPatch(
                            exp.id,
                            { clave: item.clave, presente: e.target.checked },
                            key
                          )
                        }
                        className="h-4 w-4 text-blue-600 rounded border-gray-300"
                      />
                      <span className="text-gray-800">{item.label}</span>
                      {item.requerido ? (
                        <span className="ml-auto text-xs text-red-500 font-medium">
                          requerido
                        </span>
                      ) : (
                        <span className="ml-auto text-xs text-gray-400">
                          opcional
                        </span>
                      )}
                    </label>
                  )
                })}
              </div>
              <div
                className="flex items-center gap-3"
                onClick={(e) => e.stopPropagation()}
              >
                <span className="text-sm font-medium text-gray-600">
                  Transición de estado:
                </span>
                {ESTADOS_EXPEDIENTE.filter((e) => e !== exp.estado).map((e) => {
                  const bloqueado = e !== 'incompleto' && faltantes.length > 0
                  const key = `${exp.id}:estado:${e}`
                  return (
                    <button
                      key={e}
                      disabled={bloqueado || savingKey === key}
                      title={
                        bloqueado
                          ? `Faltan requeridos: ${faltantes.join(', ')}`
                          : undefined
                      }
                      onClick={() => onPatch(exp.id, { estado: e }, key)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                        bloqueado
                          ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                          : 'bg-blue-50 text-blue-700 hover:bg-blue-100'
                      }`}
                    >
                      → {e}
                    </button>
                  )
                })}
              </div>
            </div>
          </td>
        </tr>
      )}
    </>
  )
}

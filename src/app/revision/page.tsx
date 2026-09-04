'use client'

import { useCallback, useEffect, useState } from 'react'
import ProtectedRoute from '@/components/ProtectedRoute'
import { useToast } from '@/components/Toast'

interface RevisionPayload {
  proveedor?: string | null
  numeroFactura?: string | null
  fecha?: string | null
  importe?: number | string | null
  matricula?: string | null
  categoria?: string | null
  rutaArchivo?: string | null
  nombreArchivo?: string | null
  motivo?: string | null
  tipoAccion?: string | null
  registroId?: number | null
  [key: string]: unknown
}

interface RevisionItem {
  id: number
  origen: string
  estado: string
  titulo: string
  payload: RevisionPayload
  created_at: string
}

const ORIGEN_LABEL: Record<string, { label: string; className: string }> = {
  'verificacion-manual': { label: 'Verificación manual', className: 'bg-amber-100 text-amber-800' },
  'gasto-rechazado': { label: 'Gasto rechazado', className: 'bg-red-100 text-red-800' },
  'registro-incompleto': { label: 'Registro incompleto', className: 'bg-blue-100 text-blue-800' },
  'imap-revisar': { label: 'Email a revisar', className: 'bg-purple-100 text-purple-800' },
  otro: { label: 'Otro', className: 'bg-gray-100 text-gray-700' },
}

function OrigenBadge({ origen }: { origen: string }) {
  const o = ORIGEN_LABEL[origen] ?? ORIGEN_LABEL.otro
  return (
    <span
      className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium whitespace-nowrap ${o.className}`}
    >
      {o.label}
    </span>
  )
}

function formatDateTime(d?: string | null) {
  if (!d) return '—'
  try {
    return new Date(d).toLocaleString('es-ES', {
      day: '2-digit',
      month: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    })
  } catch {
    return d
  }
}

const CAMPOS_EDITABLES = [
  { key: 'proveedor', label: 'Proveedor', type: 'text' },
  { key: 'numeroFactura', label: 'Nº factura', type: 'text' },
  { key: 'fecha', label: 'Fecha', type: 'date' },
  { key: 'importe', label: 'Importe (€)', type: 'text' },
  { key: 'matricula', label: 'Matrícula', type: 'text' },
  { key: 'categoria', label: 'Categoría', type: 'text' },
] as const

export default function RevisionPage() {
  const { showToast } = useToast()

  const [items, setItems] = useState<RevisionItem[]>([])
  const [pendientes, setPendientes] = useState(0)
  const [isLoading, setIsLoading] = useState(true)
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [form, setForm] = useState<Record<string, string>>({})
  const [isResolving, setIsResolving] = useState(false)

  const selected = items.find((i) => i.id === selectedId) ?? null

  // showToast omitido de deps a propósito: useToast devuelve una función nueva
  // por render y meterla loopearía el efecto (mismo patrón que /facturacion/registro).
  const fetchItems = useCallback(async () => {
    setIsLoading(true)
    try {
      const res = await fetch('/api/revision?estado=pendiente&limit=100')
      if (!res.ok) throw new Error('Error al cargar la bandeja')
      const data = await res.json()
      setItems((data.items ?? []) as RevisionItem[])
      setPendientes(data.pendientes ?? 0)
    } catch (err) {
      console.error(err)
      showToast('Error al cargar la bandeja de revisión', 'error')
    } finally {
      setIsLoading(false)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    fetchItems()
  }, [fetchItems])

  function selectItem(item: RevisionItem) {
    setSelectedId(item.id)
    const p = item.payload ?? {}
    const next: Record<string, string> = {}
    for (const c of CAMPOS_EDITABLES) {
      const v = p[c.key]
      next[c.key] = v == null ? '' : String(v)
    }
    setForm(next)
  }

  async function resolver(accion: 'aprobar' | 'descartar') {
    if (!selected) return
    setIsResolving(true)
    try {
      // Solo mandamos como corrección los campos que difieren del payload.
      const datos: Record<string, string> = {}
      for (const c of CAMPOS_EDITABLES) {
        const original = selected.payload?.[c.key]
        const originalStr = original == null ? '' : String(original)
        if (form[c.key] !== originalStr && form[c.key] !== '') {
          datos[c.key] = form[c.key]
        }
      }
      const res = await fetch(`/api/revision/${selected.id}/resolver`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accion, datos }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) {
        throw new Error(json.error ?? `Error ${res.status}`)
      }
      showToast(
        accion === 'aprobar' ? 'Item aprobado' : 'Item descartado',
        'success'
      )
      setSelectedId(null)
      await fetchItems()
    } catch (err) {
      console.error(err)
      showToast(
        err instanceof Error ? err.message : 'Error al resolver el item',
        'error'
      )
    } finally {
      setIsResolving(false)
    }
  }

  return (
    <ProtectedRoute>
      <div className="min-h-screen bg-gray-50">
        <div className="border-b border-gray-200 bg-white">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-6 pb-4">
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-semibold text-gray-900">
                Bandeja de revisión
              </h1>
              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-sm font-medium bg-amber-100 text-amber-800">
                {isLoading ? '…' : pendientes} pendiente{pendientes === 1 ? '' : 's'}
              </span>
            </div>
            <p className="text-sm text-gray-500 mt-1">
              Documentos dudosos del pipeline de facturas: verificación manual,
              gastos rechazados por rango, registros incompletos y emails a
              revisar. Corrige los datos y aprueba con un clic.
            </p>
          </div>
        </div>

        <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
            {/* Lista de pendientes */}
            <div className="lg:col-span-3 bg-white rounded-lg border border-gray-200 overflow-hidden">
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Título
                      </th>
                      <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Origen
                      </th>
                      <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Fecha
                      </th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {isLoading && items.length === 0 ? (
                      <tr>
                        <td
                          colSpan={3}
                          className="px-3 py-8 text-center text-sm text-gray-500"
                        >
                          Cargando…
                        </td>
                      </tr>
                    ) : items.length === 0 ? (
                      <tr>
                        <td
                          colSpan={3}
                          className="px-3 py-8 text-center text-sm text-gray-500"
                        >
                          Bandeja vacía. Nada para revisar.
                        </td>
                      </tr>
                    ) : (
                      items.map((item) => (
                        <tr
                          key={item.id}
                          onClick={() => selectItem(item)}
                          className={`cursor-pointer ${
                            selectedId === item.id
                              ? 'bg-primary-50'
                              : 'hover:bg-gray-50'
                          }`}
                        >
                          <td className="px-3 py-2 text-sm font-medium text-gray-900 max-w-[280px] truncate">
                            {item.titulo}
                          </td>
                          <td className="px-3 py-2 whitespace-nowrap">
                            <OrigenBadge origen={item.origen} />
                          </td>
                          <td className="px-3 py-2 whitespace-nowrap text-sm text-gray-600">
                            {formatDateTime(item.created_at)}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Panel de detalle */}
            <div className="lg:col-span-2">
              {!selected ? (
                <div className="bg-white rounded-lg border border-gray-200 p-8 text-center text-sm text-gray-500">
                  Selecciona un item de la lista para revisarlo.
                </div>
              ) : (
                <div className="bg-white rounded-lg border border-gray-200 p-4 space-y-4">
                  <div>
                    <div className="flex items-center justify-between gap-2">
                      <h2 className="text-base font-semibold text-gray-900">
                        {selected.titulo}
                      </h2>
                      <OrigenBadge origen={selected.origen} />
                    </div>
                    {selected.payload?.motivo && (
                      <p className="text-sm text-amber-800 mt-2 bg-amber-50 rounded px-2 py-1">
                        {selected.payload.motivo}
                      </p>
                    )}
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    {CAMPOS_EDITABLES.map((c) => (
                      <div key={c.key}>
                        <label
                          htmlFor={`campo-${c.key}`}
                          className="block text-xs font-medium text-gray-500 uppercase tracking-wider mb-1"
                        >
                          {c.label}
                        </label>
                        <input
                          id={`campo-${c.key}`}
                          type={c.type}
                          value={form[c.key] ?? ''}
                          onChange={(e) =>
                            setForm((f) => ({ ...f, [c.key]: e.target.value }))
                          }
                          className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-1 focus:ring-primary-500 focus:border-primary-500"
                        />
                      </div>
                    ))}
                  </div>

                  {selected.payload?.rutaArchivo && (
                    <div>
                      <div className="block text-xs font-medium text-gray-500 uppercase tracking-wider mb-1">
                        Archivo
                      </div>
                      {/* Solo texto: el PDF vive en OneDrive y no es accesible desde Vercel. */}
                      <p className="text-sm text-gray-700 break-all bg-gray-50 rounded px-2 py-1">
                        {selected.payload.rutaArchivo}
                        {selected.payload.nombreArchivo
                          ? ` / ${selected.payload.nombreArchivo}`
                          : ''}
                      </p>
                    </div>
                  )}

                  <div className="flex gap-2 pt-2 border-t border-gray-200">
                    <button
                      onClick={() => resolver('aprobar')}
                      disabled={isResolving}
                      className="flex-1 px-4 py-2 text-sm font-medium text-white bg-green-600 rounded-md hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                    >
                      {isResolving ? 'Procesando…' : 'Aprobar'}
                    </button>
                    <button
                      onClick={() => resolver('descartar')}
                      disabled={isResolving}
                      className="flex-1 px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                    >
                      Descartar
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </main>
      </div>
    </ProtectedRoute>
  )
}

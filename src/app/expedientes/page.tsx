'use client'

import { useState, useEffect, useCallback } from 'react'
import ProtectedRoute from '@/components/ProtectedRoute'
import { useToast } from '@/components/Toast'
import { useAuth } from '@/contexts/AuthContext'
import {
  ESTADOS_EXPEDIENTE,
  TIPO_OPERACION_LABEL,
  faltanRequeridos,
  faltanteLabel,
  itemFalta,
  type ChecklistItem,
  type EstadoExpediente,
  type TipoOperacion,
} from '@/lib/expedienteChecklist'
import type { MesChequeo, ResultadoChequeo } from '@/lib/chequeoExpedientes'

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

interface ReparacionFacturaVenta {
  ok: boolean
  dryRun: boolean
  year: number
  quarter: number
  totalFacturas: number
  reparadas: {
    numero: string
    matricula: string | null
    fecha: string
    carpeta: string | null
    archivo: string
    aplicado: boolean
  }[]
  sinPdfEnCrm: {
    numero: string
    matricula: string | null
    fecha: string
    status: string
    motivo: string
  }[]
  yaEstaban: {
    numero: string
    matricula: string | null
    fecha: string
    carpeta: string
  }[]
  fallidas: { numero: string; matricula: string | null; error: string }[]
  nota?: string
  notaSinPdf?: string
}

interface NormalizacionNombres {
  ok: boolean
  dryRun: boolean
  /** false = quedó trabajo pendiente (la función corta antes de los 60s) */
  completado: boolean
  total: number
  procesados: number
  restantes: number
  siguienteLote: string | null
  year: number
  quarter: number
  carpetas: number
  renombrados: { carpeta: string; de: string; a: string }[]
  duplicados: { carpeta: string; nombre: string; duplicadoDe: string }[]
  omitidos: { carpeta: string; nombre: string; motivo: string }[]
  yaCanonicos: { carpeta: string; nombre: string }[]
  fallidos: { carpeta: string; nombre: string; motivo: string }[]
  nota?: string
  error?: string
}

const ESTADO_BADGE: Record<EstadoExpediente, string> = {
  incompleto: 'bg-red-100 text-red-700',
  completo: 'bg-green-100 text-green-700',
  enviado: 'bg-blue-100 text-blue-700',
  confirmado: 'bg-emerald-100 text-emerald-800',
  anulado: 'bg-gray-200 text-gray-600',
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
  const [chequeo, setChequeo] = useState<ResultadoChequeo | null>(null)
  const [chequeando, setChequeando] = useState(false)
  const [reparacion, setReparacion] = useState<ReparacionFacturaVenta | null>(
    null
  )
  const [reparando, setReparando] = useState(false)
  const [nombres, setNombres] = useState<NormalizacionNombres | null>(null)
  const [normalizando, setNormalizando] = useState(false)
  const [progreso, setProgreso] = useState<{
    hechos: number
    total: number
  } | null>(null)
  const { showToast } = useToast()
  const { isAdmin } = useAuth()

  const pedirNormalizacion = useCallback(
    async (dryRun: boolean): Promise<NormalizacionNombres> => {
      const res = await fetch('/api/expedientes/normalizar-nombres', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ year, quarter, dryRun }),
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok)
        throw new Error(
          body.nota || body.error || 'Error al normalizar los nombres'
        )
      return body as NormalizacionNombres
    },
    [year, quarter]
  )

  /**
   * Aplicar va POR LOTES: el endpoint corta antes del límite de la función y
   * devuelve completado:false + restantes. Se sigue llamando hasta terminar; si
   * se corta a la mitad, volver a apretar continúa donde quedó (lo ya renombrado
   * sale como canónico, no se vuelve a tocar).
   */
  const runNormalizacion = async (dryRun: boolean) => {
    if (quarter === 'todos') return
    setNormalizando(true)
    setProgreso(null)
    try {
      if (dryRun) {
        setNombres(await pedirNormalizacion(true))
        return
      }

      const renombrados: NormalizacionNombres['renombrados'] = []
      const duplicados: NormalizacionNombres['duplicados'] = []
      const fallidos: NormalizacionNombres['fallidos'] = []
      let hechos = 0
      let total = 0
      let ultimo: NormalizacionNombres | null = null

      for (let tanda = 0; tanda < 50; tanda++) {
        const body = await pedirNormalizacion(false)
        ultimo = body
        if (tanda === 0) total = body.total
        hechos += body.procesados
        renombrados.push(...body.renombrados)
        duplicados.push(...body.duplicados)
        fallidos.push(...body.fallidos)
        setProgreso({ hechos, total: Math.max(total, hechos + body.restantes) })
        setNombres({
          ...body,
          procesados: hechos,
          renombrados,
          duplicados,
          fallidos,
        })
        if (body.completado) break
        if (body.error) throw new Error(body.error)
        // Sin avance no tiene sentido seguir golpeando: algo lo bloquea.
        if (body.procesados === 0) {
          throw new Error(
            `El renombrado no avanza (${body.restantes} pendiente(s)) — revisa los fallidos.`
          )
        }
      }

      const n = renombrados.length
      const incompleto = ultimo && !ultimo.completado
      showToast(
        incompleto
          ? `Quedaron ${ultimo!.restantes} operación(es) pendientes — vuelve a aplicar para continuar`
          : n > 0
            ? `${n} archivo(s) renombrados en OneDrive`
            : 'No había nada que renombrar',
        incompleto ? 'info' : n > 0 ? 'success' : 'info'
      )
    } catch (err) {
      console.error(err)
      showToast(
        err instanceof Error ? err.message : 'Error al normalizar',
        'error'
      )
    } finally {
      setNormalizando(false)
    }
  }

  const aplicarNormalizacion = async () => {
    if (!nombres) return
    // Continuar una corrida que se cortó: ya se confirmó al empezarla.
    if (!nombres.dryRun) {
      if (nombres.restantes > 0) await runNormalizacion(false)
      return
    }
    const total = nombres.renombrados.length + nombres.duplicados.length
    if (total === 0) return
    const ok = window.confirm(
      `Se van a renombrar ${nombres.renombrados.length} archivo(s)` +
        (nombres.duplicados.length > 0
          ? ` y borrar ${nombres.duplicados.length} duplicado(s) exactos`
          : '') +
        ' en OneDrive. Queda registrado y es reversible. ¿Aplicar?'
    )
    if (!ok) return
    await runNormalizacion(false)
  }

  const runReparacion = async (dryRun: boolean) => {
    if (quarter === 'todos') return
    setReparando(true)
    try {
      const res = await fetch('/api/expedientes/reparar-factura-venta', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ year, quarter, dryRun }),
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok)
        throw new Error(body.nota || body.error || 'Error en la reparación')
      setReparacion(body as ReparacionFacturaVenta)
      if (!dryRun) {
        const n = (body as ReparacionFacturaVenta).reparadas.filter(
          (r) => r.aplicado
        ).length
        showToast(
          n > 0
            ? `${n} factura(s) copiadas al expediente`
            : 'No había nada que copiar',
          n > 0 ? 'success' : 'info'
        )
      }
    } catch (err) {
      console.error(err)
      showToast(
        err instanceof Error ? err.message : 'Error al reparar',
        'error'
      )
    } finally {
      setReparando(false)
    }
  }

  const aplicarReparacion = async () => {
    if (!reparacion || reparacion.reparadas.length === 0) return
    const ok = window.confirm(
      `Se van a copiar ${reparacion.reparadas.length} factura(s) de venta a su carpeta de expediente en OneDrive. ¿Aplicar?`
    )
    if (!ok) return
    await runReparacion(false)
  }

  const runChequeo = async () => {
    if (quarter === 'todos') return
    setChequeando(true)
    try {
      const res = await fetch(
        `/api/gestoria/chequeo-expedientes?quarter=${quarter}&year=${year}`
      )
      const body = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(body.error || 'Error en el chequeo')
      setChequeo(body as ResultadoChequeo)
    } catch (err) {
      console.error(err)
      showToast(
        err instanceof Error
          ? err.message
          : 'Error al chequear los expedientes',
        'error'
      )
    } finally {
      setChequeando(false)
    }
  }

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
          `${payload.error}. Faltan: ${((payload.faltantes ?? []) as string[]).map(faltanteLabel).join(', ')}`,
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
              <span className="text-sm font-medium text-gray-600">
                Trimestre:
              </span>
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
            <div className="ml-auto flex flex-wrap items-center gap-2">
              <button
                onClick={runChequeo}
                disabled={chequeando || quarter === 'todos'}
                title={
                  quarter === 'todos'
                    ? 'Elige un trimestre concreto para chequear'
                    : undefined
                }
                className={`px-4 py-2 rounded-lg text-sm font-bold shadow-sm transition-all ${
                  chequeando || quarter === 'todos'
                    ? 'bg-gray-200 text-gray-400 cursor-not-allowed'
                    : 'bg-indigo-600 text-white hover:bg-indigo-700'
                }`}
              >
                {chequeando ? 'Chequeando…' : 'Chequear expedientes gestoría'}
              </button>
              {isAdmin && (
                <button
                  onClick={() => runReparacion(true)}
                  disabled={reparando || quarter === 'todos'}
                  title={
                    quarter === 'todos'
                      ? 'Elige un trimestre concreto para reparar'
                      : 'Simula primero: no copia nada hasta confirmar'
                  }
                  className={`px-4 py-2 rounded-lg text-sm font-bold shadow-sm transition-all ${
                    reparando || quarter === 'todos'
                      ? 'bg-gray-200 text-gray-400 cursor-not-allowed'
                      : 'bg-amber-600 text-white hover:bg-amber-700'
                  }`}
                >
                  {reparando ? 'Reparando…' : 'Reparar facturas de venta'}
                </button>
              )}
              {isAdmin && (
                <button
                  onClick={() => runNormalizacion(true)}
                  disabled={normalizando || quarter === 'todos'}
                  title={
                    quarter === 'todos'
                      ? 'Elige un trimestre concreto para normalizar'
                      : 'Simula primero: no renombra nada hasta confirmar'
                  }
                  className={`px-4 py-2 rounded-lg text-sm font-bold shadow-sm transition-all ${
                    normalizando || quarter === 'todos'
                      ? 'bg-gray-200 text-gray-400 cursor-not-allowed'
                      : 'bg-teal-600 text-white hover:bg-teal-700'
                  }`}
                >
                  {normalizando
                    ? 'Normalizando…'
                    : 'Normalizar nombres de archivos'}
                </button>
              )}
            </div>
          </div>

          {/* Normalización de nombres de archivo en OneDrive */}
          {nombres && (
            <NombresPanel
              nom={nombres}
              onAplicar={aplicarNormalizacion}
              aplicando={normalizando}
              progreso={progreso}
            />
          )}

          {/* Reparación de facturas de venta */}
          {reparacion && (
            <ReparacionPanel
              rep={reparacion}
              onAplicar={aplicarReparacion}
              aplicando={reparando}
            />
          )}

          {/* Resultado del chequeo integral */}
          {chequeo && <ChequeoPanel chequeo={chequeo} />}

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
                title={
                  item.grupo
                    ? `${item.label} — alternativo: basta con la factura de compra O el contrato de compraventa`
                    : `${item.label}${item.requerido ? ' (requerido)' : ' (opcional)'}`
                }
                className={`px-2 py-1 rounded-full text-xs font-medium ${
                  item.presente
                    ? 'bg-green-100 text-green-700'
                    : itemFalta(checklist, item)
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
                Marca a mano los documentos verificados. Los que la
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
                          ? `Faltan requeridos: ${faltantes.map(faltanteLabel).join(', ')}`
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

function NombresPanel({
  nom,
  onAplicar,
  aplicando,
  progreso,
}: {
  nom: NormalizacionNombres
  onAplicar: () => void
  aplicando: boolean
  progreso: { hechos: number; total: number } | null
}) {
  const pendientes = nom.renombrados.length + nom.duplicados.length
  // Se cortó a mitad (o falló un lote): volver a aplicar CONTINÚA donde quedó.
  const reanudable = !nom.dryRun && !nom.completado

  return (
    <div className="bg-white rounded-xl shadow-md border border-teal-200 p-4 space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <h3 className="text-sm font-bold text-gray-800">
          Nombres de archivo — {nom.quarter}T {nom.year}
        </h3>
        <span className="text-xs text-gray-500">
          {nom.carpetas} carpeta(s) · {nom.renombrados.length}{' '}
          {nom.dryRun ? 'a renombrar' : 'renombrados'} · {nom.duplicados.length}{' '}
          duplicado(s) · {nom.omitidos.length} sin tocar ·{' '}
          {nom.yaCanonicos.length} ya correctos
        </span>
        {aplicando && progreso && (
          <span className="text-xs font-medium text-teal-700">
            {progreso.hechos} de {progreso.total}…
          </span>
        )}
        {(nom.dryRun || reanudable) && (pendientes > 0 || reanudable) && (
          <button
            onClick={onAplicar}
            disabled={aplicando}
            className={`ml-auto px-4 py-2 rounded-lg text-sm font-bold shadow-sm transition-all ${
              aplicando
                ? 'bg-gray-200 text-gray-400 cursor-not-allowed'
                : 'bg-teal-600 text-white hover:bg-teal-700'
            }`}
          >
            {aplicando
              ? progreso
                ? `Aplicando ${progreso.hechos}/${progreso.total}…`
                : 'Aplicando…'
              : reanudable
                ? `Continuar (${nom.restantes})`
                : `Aplicar (${pendientes})`}
          </button>
        )}
      </div>

      {reanudable && (
        <div className="text-xs text-amber-800 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2">
          Quedaron {nom.restantes} operación(es) sin hacer
          {nom.siguienteLote ? ` (sigue por ${nom.siguienteLote})` : ''}. Vuelve
          a aplicar: continúa donde quedó, lo ya renombrado no se vuelve a
          tocar.
        </div>
      )}

      {nom.error && (
        <div className="text-xs text-red-800 bg-red-50 border border-red-100 rounded-lg px-3 py-2">
          {nom.error}
        </div>
      )}

      {nom.nota && <div className="text-xs text-gray-500">{nom.nota}</div>}

      {nom.renombrados.length > 0 && (
        <div className="space-y-1">
          <div className="text-xs font-bold text-gray-700">
            {nom.dryRun ? 'Se renombrarán' : 'Renombrados'} (
            {nom.renombrados.length})
          </div>
          {nom.renombrados.map((r) => (
            <div
              key={`${r.carpeta}-${r.de}`}
              className="flex flex-wrap items-center gap-2 border border-gray-100 rounded-lg px-3 py-2 text-xs"
            >
              <span className="font-medium text-gray-900">{r.carpeta}</span>
              <span className="text-gray-500 line-through">{r.de}</span>
              <span className="text-gray-400">→</span>
              <span className="px-2 py-1 rounded-full bg-teal-100 text-teal-800 font-medium">
                {r.a}
              </span>
            </div>
          ))}
        </div>
      )}

      {nom.duplicados.length > 0 && (
        <div className="space-y-1">
          <div className="text-xs font-bold text-yellow-800">
            Duplicados exactos ({nom.duplicados.length}) —{' '}
            {nom.dryRun ? 'se borrarán' : 'borrados'}
          </div>
          {nom.duplicados.map((d) => (
            <div
              key={`${d.carpeta}-${d.nombre}`}
              className="border border-yellow-100 bg-yellow-50 rounded-lg px-3 py-2 text-xs text-yellow-900"
            >
              <span className="font-medium">{d.carpeta}</span> · {d.nombre}
              {d.duplicadoDe ? ` = ${d.duplicadoDe} (mismo contenido)` : ''}
            </div>
          ))}
        </div>
      )}

      {nom.omitidos.length > 0 && (
        <div className="space-y-1">
          <div className="text-xs font-bold text-gray-700">
            Sin tocar ({nom.omitidos.length}) — no se renombra lo que no está
            identificado con certeza
          </div>
          {nom.omitidos.map((o) => (
            <div
              key={`${o.carpeta}-${o.nombre}`}
              className="flex flex-wrap items-center gap-2 border border-gray-100 rounded-lg px-3 py-2 text-xs"
            >
              <span className="font-medium text-gray-900">{o.carpeta}</span>
              <span className="text-gray-700">{o.nombre}</span>
              <span className="ml-auto text-gray-500">{o.motivo}</span>
            </div>
          ))}
        </div>
      )}

      {nom.fallidos.length > 0 && (
        <div className="space-y-1">
          <div className="text-xs font-bold text-red-700">
            Fallos ({nom.fallidos.length})
          </div>
          {nom.fallidos.map((f) => (
            <div
              key={`${f.carpeta}-${f.nombre}`}
              className="text-xs text-red-700"
            >
              {f.carpeta} / {f.nombre}: {f.motivo}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function ReparacionPanel({
  rep,
  onAplicar,
  aplicando,
}: {
  rep: ReparacionFacturaVenta
  onAplicar: () => void
  aplicando: boolean
}) {
  return (
    <div className="bg-white rounded-xl shadow-md border border-amber-200 p-4 space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <h3 className="text-sm font-bold text-gray-800">
          Reparación de facturas de venta — {rep.quarter}T {rep.year}
        </h3>
        <span className="text-xs text-gray-500">
          {rep.totalFacturas} facturas · {rep.yaEstaban.length} ya estaban ·{' '}
          {rep.reparadas.length} {rep.dryRun ? 'a copiar' : 'copiadas'} ·{' '}
          {rep.sinPdfEnCrm.length} sin PDF en el CRM
        </span>
        {rep.dryRun && rep.reparadas.length > 0 && (
          <button
            onClick={onAplicar}
            disabled={aplicando}
            className={`ml-auto px-4 py-2 rounded-lg text-sm font-bold shadow-sm transition-all ${
              aplicando
                ? 'bg-gray-200 text-gray-400 cursor-not-allowed'
                : 'bg-amber-600 text-white hover:bg-amber-700'
            }`}
          >
            {aplicando ? 'Aplicando…' : `Aplicar (${rep.reparadas.length})`}
          </button>
        )}
      </div>

      {rep.nota && <div className="text-xs text-gray-500">{rep.nota}</div>}

      {rep.reparadas.length > 0 && (
        <div className="space-y-1">
          <div className="text-xs font-bold text-gray-700">
            {rep.dryRun
              ? 'Se copiarán al expediente (el CRM tiene el PDF)'
              : 'Copiadas al expediente'}
          </div>
          {rep.reparadas.map((r) => (
            <div
              key={r.numero}
              className="flex flex-wrap items-center gap-2 border border-gray-100 rounded-lg px-3 py-2 text-xs"
            >
              <span className="font-medium text-gray-900">{r.numero}</span>
              <span className="text-gray-500">
                {r.matricula ?? 'sin matrícula'} · {r.fecha} ·{' '}
                {r.carpeta ?? 'carpeta a crear'}
              </span>
              <span className="ml-auto px-2 py-1 rounded-full bg-amber-100 text-amber-800 font-medium">
                {r.aplicado ? '✓ ' : ''}
                {r.archivo}
              </span>
            </div>
          ))}
        </div>
      )}

      {rep.sinPdfEnCrm.length > 0 && (
        <div className="space-y-1">
          <div className="text-xs font-bold text-red-700">
            No reparables automáticamente ({rep.sinPdfEnCrm.length}) — subilas a
            mano
          </div>
          {rep.notaSinPdf && (
            <div className="text-xs text-red-600">{rep.notaSinPdf}</div>
          )}
          {rep.sinPdfEnCrm.map((s) => (
            <div
              key={s.numero}
              className="flex flex-wrap items-center gap-2 border border-red-100 bg-red-50 rounded-lg px-3 py-2 text-xs"
            >
              <span className="font-medium text-gray-900">{s.numero}</span>
              <span className="text-gray-600">
                {s.matricula ?? 'sin matrícula'} · {s.fecha} · {s.status}
              </span>
              <span className="ml-auto text-red-700">{s.motivo}</span>
            </div>
          ))}
        </div>
      )}

      {rep.fallidas.length > 0 && (
        <div className="space-y-1">
          <div className="text-xs font-bold text-red-700">
            Fallos ({rep.fallidas.length})
          </div>
          {rep.fallidas.map((f) => (
            <div key={f.numero} className="text-xs text-red-700">
              {f.numero} ({f.matricula ?? 'sin matrícula'}): {f.error}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function ChequeoPanel({ chequeo }: { chequeo: ResultadoChequeo }) {
  const [mesAbierto, setMesAbierto] = useState<string | null>(null)
  const { resumen, meses, expedientesDocs } = chequeo
  const sinSnapshot = meses.some((m) => !m.carpetas.verificable)
  const conFaltantes = expedientesDocs.filter((e) => e.faltantes.length > 0)
  const conConflicto = expedientesDocs.filter(
    (e) => e.mismoArchivoDosNombres.length > 0
  )
  const conDuplicados = expedientesDocs.filter((e) => e.duplicados.length > 0)
  const conAmbiguos = expedientesDocs.filter((e) => e.ambiguos.length > 0)

  return (
    <div className="space-y-4">
      {/* Banner resumen */}
      {resumen.ok ? (
        <div className="bg-green-50 border border-green-300 rounded-xl p-4 flex items-center gap-3">
          <span className="text-green-600 text-xl font-bold">✓</span>
          <div>
            <div className="text-sm font-bold text-green-800">
              Listo para cerrar — {chequeo.quarter}T {chequeo.year}
            </div>
            <div className="text-xs text-green-700">
              Facturas, carpetas de OneDrive y bandas de CB cuadran, sin
              documentos faltantes.
            </div>
          </div>
        </div>
      ) : (
        <div className="bg-red-50 border border-red-300 rounded-xl p-4">
          <div className="text-sm font-bold text-red-800">
            ✗ {resumen.bloqueantes.length} bloqueante
            {resumen.bloqueantes.length === 1 ? '' : 's'} para cerrar{' '}
            {chequeo.quarter}T {chequeo.year}
          </div>
          <ul className="mt-2 space-y-1 text-xs text-red-700 list-disc list-inside">
            {resumen.bloqueantes.map((b, i) => (
              <li key={i}>{b}</li>
            ))}
          </ul>
        </div>
      )}

      {sinSnapshot && (
        <div className="bg-yellow-50 border border-yellow-300 rounded-xl p-4 text-sm text-yellow-800">
          Sin snapshot de OneDrive todavía (corre a las 21:15 o pedilo manual) —
          las carpetas de expedientes no se pudieron verificar.
        </div>
      )}
      {resumen.notas
        .filter((n) => !n.startsWith('sin snapshot'))
        .map((n, i) => (
          <div
            key={i}
            className="bg-yellow-50 border border-yellow-300 rounded-xl p-4 text-sm text-yellow-800"
          >
            {n}
          </div>
        ))}

      {/* Tabla por mes */}
      <div className="bg-white rounded-xl shadow-md border border-gray-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                {[
                  'Mes',
                  'Facturas DB',
                  'Carpetas OneDrive',
                  'Banda CB',
                  'Cuadra',
                ].map((h) => (
                  <th
                    key={h}
                    className="px-3 sm:px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider"
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {meses.map((m) => (
                <MesChequeoRow
                  key={m.mes}
                  mes={m}
                  abierto={mesAbierto === m.mes}
                  onToggle={() =>
                    setMesAbierto(mesAbierto === m.mes ? null : m.mes)
                  }
                />
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Expedientes con documentos faltantes */}
      {conFaltantes.length > 0 && (
        <div className="bg-white rounded-xl shadow-md border border-gray-200 p-4 space-y-3">
          <h3 className="text-sm font-bold text-gray-800">
            Expedientes con documentos faltantes ({conFaltantes.length})
          </h3>
          {conFaltantes.map((e) => (
            <div
              key={`${e.mes}-${e.carpeta}`}
              className="flex flex-wrap items-center gap-2 border border-gray-100 rounded-lg px-3 py-2"
            >
              <span className="text-sm font-medium text-gray-900">
                {e.carpeta}
              </span>
              <span className="text-xs text-gray-500">
                {e.mes} · {e.matricula ?? 'sin matrícula'} ·{' '}
                {e.tipoOperacion === 'desconocido'
                  ? 'operación desconocida'
                  : TIPO_OPERACION_LABEL[e.tipoOperacion]}
              </span>
              {e.faltantes.map((f) => (
                <span
                  key={f}
                  className="px-2 py-1 rounded-full text-xs font-medium bg-red-100 text-red-700"
                >
                  falta {faltanteLabel(f)}
                </span>
              ))}
            </div>
          ))}
        </div>
      )}

      {/* Mismo archivo con dos nombres: uno de los dos documentos NO existe */}
      {conConflicto.length > 0 && (
        <div className="bg-white rounded-xl shadow-md border border-red-300 p-4 space-y-3">
          <h3 className="text-sm font-bold text-red-800">
            Mismo archivo con dos nombres ({conConflicto.length}) — error de
            clasificación
          </h3>
          {conConflicto.map((e) =>
            e.mismoArchivoDosNombres.map((m) => (
              <div
                key={`${e.carpeta}-${m.hash}`}
                className="border border-red-100 rounded-lg px-3 py-2"
              >
                <div className="text-sm font-medium text-gray-900">
                  {e.carpeta}
                </div>
                <div className="text-xs text-red-700">
                  {m.nombres.join(' = ')} — contenido idéntico: uno de esos
                  documentos no existe realmente
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {/* Archivos duplicados (mismo contenido guardado dos veces) */}
      {conDuplicados.length > 0 && (
        <div className="bg-white rounded-xl shadow-md border border-yellow-300 p-4 space-y-3">
          <h3 className="text-sm font-bold text-yellow-800">
            Archivos duplicados ({conDuplicados.length} carpeta
            {conDuplicados.length === 1 ? '' : 's'})
          </h3>
          {conDuplicados.map((e) =>
            e.duplicados.map((d) => (
              <div
                key={`${e.carpeta}-${d.hash}`}
                className="border border-yellow-100 rounded-lg px-3 py-2"
              >
                <div className="text-sm font-medium text-gray-900">
                  {e.carpeta}
                </div>
                <div className="text-xs text-yellow-800">
                  {d.nombres.join(' = ')}
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {/* Archivos sin clasificar → revisar a mano */}
      {conAmbiguos.length > 0 && (
        <div className="bg-white rounded-xl shadow-md border border-gray-200 p-4 space-y-3">
          <h3 className="text-sm font-bold text-gray-800">
            Archivos sin clasificar — revisar a mano (
            {conAmbiguos.reduce((n, e) => n + e.ambiguos.length, 0)})
          </h3>
          {conAmbiguos.map((e) => (
            <div
              key={`amb-${e.mes}-${e.carpeta}`}
              className="border border-gray-100 rounded-lg px-3 py-2"
            >
              <div className="text-sm font-medium text-gray-900">
                {e.carpeta}
              </div>
              <ul className="mt-1 text-xs text-gray-600 list-disc list-inside">
                {e.ambiguos.map((a) => (
                  <li key={a.nombre}>
                    {a.nombre}{' '}
                    <span className="text-gray-400">({a.motivo})</span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function MesChequeoRow({
  mes,
  abierto,
  onToggle,
}: {
  mes: MesChequeo
  abierto: boolean
  onToggle: () => void
}) {
  const d = mes.descuadres
  const nDescuadres =
    d.facturasSinCarpeta.length +
    d.carpetasSinFactura.length +
    d.cbSinFactura.length +
    d.facturaSinCb.length +
    d.bandaIncorrecta.length

  return (
    <>
      <tr className="hover:bg-gray-50 cursor-pointer" onClick={onToggle}>
        <td className="px-3 sm:px-6 py-3 whitespace-nowrap text-sm font-medium text-gray-900">
          {mes.mes}
        </td>
        <td className="px-3 sm:px-6 py-3 whitespace-nowrap text-sm text-gray-700">
          {mes.facturas.count}
        </td>
        <td className="px-3 sm:px-6 py-3 whitespace-nowrap text-sm text-gray-700">
          {mes.carpetas.verificable ? mes.carpetas.count : '—'}
        </td>
        <td className="px-3 sm:px-6 py-3 whitespace-nowrap text-sm text-gray-700">
          {mes.cbBanda.verificable ? mes.cbBanda.count : '—'}
        </td>
        <td className="px-3 sm:px-6 py-3 whitespace-nowrap">
          <span
            className={`px-2 py-1 rounded-full text-xs font-bold ${
              mes.ok ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
            }`}
          >
            {mes.ok
              ? '✓'
              : `✗ ${nDescuadres} descuadre${nDescuadres === 1 ? '' : 's'}`}
          </span>
        </td>
      </tr>
      {abierto && (
        <tr className="bg-gray-50">
          <td
            colSpan={5}
            className="px-3 sm:px-6 py-3 text-xs text-gray-700 space-y-1"
          >
            {nDescuadres === 0 && (
              <div className="text-green-700">Sin descuadres en {mes.mes}.</div>
            )}
            {d.bandaIncorrecta.map((b) => (
              <div
                key={`bi-${b.matricula}`}
                className="text-red-700 font-medium"
              >
                Banda incorrecta: {b.matricula} facturado en {b.mesFactura} pero
                está en la banda {b.bandaCb} de CB
              </div>
            ))}
            {d.facturasSinCarpeta.map((f) => (
              <div key={`fsc-${f.numero}`}>
                Factura sin carpeta en OneDrive: {f.numero} (
                {f.matricula ?? 'sin matrícula'})
              </div>
            ))}
            {d.carpetasSinFactura.map((c) => (
              <div key={`csf-${c}`}>Carpeta sin factura activa: {c}</div>
            ))}
            {d.cbSinFactura.map((m2) => (
              <div key={`cbs-${m2}`}>En banda CB sin factura activa: {m2}</div>
            ))}
            {d.facturaSinCb.map((f) => (
              <div key={`fscb-${f.numero}`}>
                Factura sin fila en CB: {f.numero} (
                {f.matricula ?? 'sin matrícula'})
              </div>
            ))}
            {mes.carpetas.scannedAt && (
              <div className="text-gray-400">
                Snapshot OneDrive: {mes.carpetas.scannedAt}
              </div>
            )}
          </td>
        </tr>
      )}
    </>
  )
}

'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import ProtectedRoute from '@/components/ProtectedRoute'
import { useSimpleToast } from '@/hooks/useSimpleToast'
import { downloadPdf } from '@/lib/pdf/download'
import ConfirmDeleteModal from '@/components/ConfirmDeleteModal'

interface ClienteB2B {
  id: number
  tipo: 'empresa' | 'autonomo' | 'profesional'
  razon_social: string
  cif_nif: string
  contacto_nombre: string | null
  telefono: string | null
  email: string | null
  direccion: string | null
  ciudad: string | null
  codigo_postal: string | null
  provincia: string | null
  notas: string | null
}
interface VentaB2B {
  id: number
  numero: string
  fecha_venta: string
  precio_venta: string
  vehiculo_marca: string | null
  vehiculo_modelo: string | null
  vehiculo_matricula: string | null
  status: string
  pdf_url: string | null
  factura_id: number | null
  factura_numero: string | null
  factura_pdf_url: string | null
}

function fmtEUR(n: number | string) {
  const v = typeof n === 'string' ? parseFloat(n) : n
  return v.toLocaleString('es-ES', { style: 'currency', currency: 'EUR' })
}

function ClienteB2BDetailPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const { showToast, ToastContainer } = useSimpleToast()
  const [cliente, setCliente] = useState<ClienteB2B | null>(null)
  const [ventas, setVentas] = useState<VentaB2B[]>([])
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState(false)
  const [downloadingId, setDownloadingId] = useState<number | null>(null)
  const [downloadingFacturaId, setDownloadingFacturaId] = useState<number | null>(null)
  const [issuingFacturaId, setIssuingFacturaId] = useState<number | null>(null)
  const [previewingId, setPreviewingId] = useState<number | null>(null)
  const [ventaToDelete, setVentaToDelete] = useState<VentaB2B | null>(null)
  const [deletingVenta, setDeletingVenta] = useState(false)

  const previewFacturaREBU = async (venta: VentaB2B) => {
    await downloadPdf({
      url: `/api/ventas-b2b/${venta.id}/factura/preview`,
      filename: `preview-factura-${venta.numero}`,
      onStart: () => setPreviewingId(venta.id),
      onFinish: () => setPreviewingId(null),
      onError: (msg) => showToast(msg, 'error'),
    })
  }

  const confirmDeleteVenta = async () => {
    if (!ventaToDelete) return
    setDeletingVenta(true)
    try {
      const res = await fetch(`/api/ventas-b2b/${ventaToDelete.id}`, {
        method: 'DELETE',
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        showToast(data?.error ?? 'Error al borrar la venta', 'error')
        return
      }
      showToast('Venta eliminada', 'success')
      setVentaToDelete(null)
      await reloadVentas()
    } catch (err) {
      console.error(err)
      showToast('Error de red', 'error')
    } finally {
      setDeletingVenta(false)
    }
  }

  const reloadVentas = async () => {
    const r = await fetch(`/api/clientes-b2b/${id}/ventas`).then((r) => r.json())
    setVentas(Array.isArray(r) ? r : [])
  }

  const generarFacturaREBU = async (venta: VentaB2B) => {
    if (
      !confirm(
        `¿Emitir factura REBU para ${venta.numero}?\n\n` +
          'Esto consume el siguiente número fiscal del CRM y crea la factura definitiva.'
      )
    )
      return
    setIssuingFacturaId(venta.id)
    try {
      const res = await fetch(`/api/ventas-b2b/${venta.id}/factura`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Idempotency-Key': `b2b-${venta.id}-${Date.now()}`,
        },
        body: JSON.stringify({ invoiceType: 'REBU' }),
      })
      const data = await res.json()
      if (!res.ok) {
        showToast(data?.error ?? 'Error emitiendo factura', 'error')
        return
      }
      if (data.alreadyExisted) {
        showToast(
          `Esta venta ya tenía la factura ${data.invoice.full_invoice_number}`,
          'info'
        )
      } else {
        showToast(
          `Factura ${data.invoice.full_invoice_number} emitida`,
          'success'
        )
      }
      await reloadVentas()
    } catch (err) {
      console.error(err)
      showToast('Error de red', 'error')
    } finally {
      setIssuingFacturaId(null)
    }
  }

  const descargarFactura = async (venta: VentaB2B) => {
    await downloadPdf({
      url: `/api/ventas-b2b/${venta.id}/factura`,
      filename: `factura-${venta.factura_numero ?? venta.numero}`,
      onStart: () => setDownloadingFacturaId(venta.id),
      onFinish: () => setDownloadingFacturaId(null),
      onError: (msg) => showToast(msg, 'error'),
    })
  }

  useEffect(() => {
    Promise.all([
      fetch(`/api/clientes-b2b/${id}`).then((r) => r.json()),
      fetch(`/api/clientes-b2b/${id}/ventas`).then((r) => r.json()),
    ])
      .then(([c, v]) => {
        setCliente(c)
        setVentas(Array.isArray(v) ? v : [])
      })
      .catch(() => showToast('Error cargando cliente', 'error'))
      .finally(() => setLoading(false))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id])

  const saveEdit = async () => {
    if (!cliente) return
    try {
      const res = await fetch(`/api/clientes-b2b/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(cliente),
      })
      if (!res.ok) {
        const e = await res.json().catch(() => ({}))
        showToast(e.error ?? 'Error guardando', 'error')
        return
      }
      showToast('Cliente actualizado', 'success')
      setEditing(false)
    } catch {
      showToast('Error de red', 'error')
    }
  }

  const archiveClient = async () => {
    if (!confirm('¿Archivar este cliente? Se ocultará del listado.')) return
    const res = await fetch(`/api/clientes-b2b/${id}`, { method: 'DELETE' })
    if (res.ok) {
      showToast('Cliente archivado', 'success')
      router.push('/clientes-b2b')
    } else {
      showToast('Error al archivar', 'error')
    }
  }

  const downloadContrato = async (venta: VentaB2B) => {
    await downloadPdf({
      url: `/api/ventas-b2b/${venta.id}/contrato`,
      filename: `contrato-b2b-${venta.numero}`,
      onStart: () => setDownloadingId(venta.id),
      onFinish: () => setDownloadingId(null),
      onError: (msg) => showToast(msg, 'error'),
    })
  }

  if (loading) {
    return (
      <div className="min-h-full bg-gray-50 p-8 text-center text-gray-500">
        Cargando cliente B2B...
      </div>
    )
  }
  if (!cliente) {
    return (
      <div className="min-h-full bg-gray-50 p-8 text-center text-red-600">
        Cliente no encontrado.
      </div>
    )
  }

  const C = cliente
  const update = (k: keyof ClienteB2B, v: string) =>
    setCliente({ ...C, [k]: v })

  return (
    <div className="min-h-full bg-gradient-to-br from-slate-50 via-emerald-50 to-teal-100">
      <ToastContainer />
      <main className="w-[80%] max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-4">
        {/* Header */}
        <div className="bg-slate-800 rounded-xl shadow-xl p-4 flex items-center justify-between flex-wrap gap-3">
          <div>
            <Link href="/clientes-b2b" className="text-emerald-300 text-xs hover:underline">
              ← Clientes B2B
            </Link>
            <h1 className="text-xl font-bold text-white mt-1">{C.razon_social}</h1>
            <p className="text-slate-300 text-xs font-mono">
              {C.cif_nif} · {C.tipo}
            </p>
          </div>
          <div className="flex gap-2">
            <Link
              href={`/clientes-b2b/${id}/venta/nueva`}
              className="px-4 py-2 bg-emerald-600 text-white rounded-lg text-sm font-medium hover:bg-emerald-700"
            >
              + Generar nueva venta
            </Link>
            {!editing ? (
              <button
                onClick={() => setEditing(true)}
                className="px-4 py-2 bg-white text-slate-800 rounded-lg text-sm font-medium hover:bg-gray-100"
              >
                Editar
              </button>
            ) : (
              <button
                onClick={saveEdit}
                className="px-4 py-2 bg-emerald-100 text-emerald-800 rounded-lg text-sm font-medium hover:bg-emerald-200"
              >
                Guardar
              </button>
            )}
            <button
              onClick={archiveClient}
              className="px-3 py-2 bg-red-500/20 text-red-300 rounded-lg text-sm font-medium hover:bg-red-500/30"
            >
              Archivar
            </button>
          </div>
        </div>

        {/* Datos */}
        <div className="bg-white rounded-xl shadow border border-gray-200 p-6">
          <h2 className="text-sm font-semibold text-gray-700 mb-3 uppercase">Datos</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {(
              [
                ['razon_social', 'Razón social / Nombre'],
                ['cif_nif', 'CIF / NIF'],
                ['contacto_nombre', 'Contacto'],
                ['telefono', 'Teléfono'],
                ['email', 'Email'],
                ['direccion', 'Dirección'],
                ['ciudad', 'Ciudad'],
                ['codigo_postal', 'Cód. postal'],
                ['provincia', 'Provincia'],
              ] as const
            ).map(([k, label]) => (
              <div key={k}>
                <label className="block text-xs font-medium text-gray-600 mb-1">
                  {label}
                </label>
                {editing ? (
                  <input
                    value={(C[k] as string) ?? ''}
                    onChange={(e) => update(k, e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                  />
                ) : (
                  <div className="text-sm text-gray-900 px-3 py-2 bg-gray-50 rounded-lg">
                    {C[k] || '—'}
                  </div>
                )}
              </div>
            ))}
            <div className="sm:col-span-2">
              <label className="block text-xs font-medium text-gray-600 mb-1">Notas</label>
              {editing ? (
                <textarea
                  value={C.notas ?? ''}
                  onChange={(e) => update('notas', e.target.value)}
                  rows={3}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                />
              ) : (
                <div className="text-sm text-gray-900 px-3 py-2 bg-gray-50 rounded-lg whitespace-pre-wrap">
                  {C.notas || '—'}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Historial de ventas */}
        <div className="bg-white rounded-xl shadow border border-gray-200 overflow-hidden">
          <div className="px-6 py-3 border-b border-gray-200 flex items-center justify-between bg-gray-50">
            <h2 className="text-sm font-semibold text-gray-700 uppercase">
              Historial de ventas ({ventas.length})
            </h2>
          </div>
          {ventas.length === 0 ? (
            <div className="p-8 text-center text-gray-500 text-sm">
              Aún no hay ventas. Hacé clic en "Generar nueva venta".
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-100">
                <tr>
                  <th className="text-left px-4 py-2 font-medium text-gray-700">Nº</th>
                  <th className="text-left px-4 py-2 font-medium text-gray-700">Fecha</th>
                  <th className="text-left px-4 py-2 font-medium text-gray-700">Vehículo</th>
                  <th className="text-left px-4 py-2 font-medium text-gray-700">Precio</th>
                  <th className="text-left px-4 py-2 font-medium text-gray-700">Contrato</th>
                  <th className="text-left px-4 py-2 font-medium text-gray-700">Factura</th>
                  <th className="text-right px-4 py-2 font-medium text-gray-700">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {ventas.map((v) => (
                  <tr key={v.id} className="border-b border-gray-100 align-top">
                    <td className="px-4 py-3 font-mono text-xs">{v.numero}</td>
                    <td className="px-4 py-3">
                      {new Date(v.fecha_venta).toLocaleDateString('es-ES')}
                    </td>
                    <td className="px-4 py-3">
                      {v.vehiculo_marca} {v.vehiculo_modelo}{' '}
                      <span className="text-gray-500 text-xs">
                        ({v.vehiculo_matricula})
                      </span>
                    </td>
                    <td className="px-4 py-3 font-semibold text-gray-900">
                      {fmtEUR(v.precio_venta)}
                    </td>
                    {/* Contrato (en el estado) */}
                    <td className="px-4 py-3">
                      {v.pdf_url ? (
                        <button
                          onClick={() => downloadContrato(v)}
                          disabled={downloadingId === v.id}
                          className="px-3 py-1 bg-emerald-100 text-emerald-700 rounded text-xs font-medium hover:bg-emerald-200 disabled:opacity-60"
                        >
                          {downloadingId === v.id ? 'Descargando...' : 'Descargar contrato'}
                        </button>
                      ) : (
                        <span className="text-gray-400 text-xs">Sin contrato</span>
                      )}
                    </td>
                    {/* Factura REBU */}
                    <td className="px-4 py-3">
                      {v.factura_id && v.factura_pdf_url ? (
                        <div className="flex flex-col gap-1">
                          <span className="font-mono text-xs text-emerald-700">
                            {v.factura_numero}
                          </span>
                          <button
                            onClick={() => descargarFactura(v)}
                            disabled={downloadingFacturaId === v.id}
                            className="px-3 py-1 bg-emerald-600 text-white rounded text-xs font-medium hover:bg-emerald-700 disabled:opacity-60"
                          >
                            {downloadingFacturaId === v.id
                              ? 'Descargando...'
                              : 'Descargar factura'}
                          </button>
                        </div>
                      ) : (
                        <div className="flex flex-col gap-1">
                          <button
                            onClick={() => generarFacturaREBU(v)}
                            disabled={issuingFacturaId === v.id}
                            className="px-3 py-1 bg-amber-100 text-amber-800 border border-amber-300 rounded text-xs font-medium hover:bg-amber-200 disabled:opacity-60"
                          >
                            {issuingFacturaId === v.id
                              ? 'Emitiendo...'
                              : 'Generar factura REBU'}
                          </button>
                          <button
                            onClick={() => previewFacturaREBU(v)}
                            disabled={previewingId === v.id}
                            title="Genera un PDF de muestra (BORRADOR-) sin consumir número fiscal"
                            className="px-3 py-1 bg-white text-gray-700 border border-gray-300 rounded text-xs font-medium hover:bg-gray-50 disabled:opacity-60"
                          >
                            {previewingId === v.id ? 'Generando...' : 'Vista previa'}
                          </button>
                        </div>
                      )}
                    </td>
                    {/* Acciones (borrar venta — solo si no tiene factura) */}
                    <td className="px-4 py-3 text-right">
                      <button
                        onClick={() => setVentaToDelete(v)}
                        disabled={!!v.factura_id}
                        title={
                          v.factura_id
                            ? 'No se puede borrar: tiene factura fiscal emitida'
                            : 'Eliminar esta venta'
                        }
                        className="px-2 py-1 text-red-600 hover:bg-red-50 rounded text-xs font-medium disabled:opacity-30 disabled:cursor-not-allowed"
                      >
                        Borrar
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </main>

      <ConfirmDeleteModal
        isOpen={!!ventaToDelete}
        onClose={() => !deletingVenta && setVentaToDelete(null)}
        onConfirm={confirmDeleteVenta}
        title="Eliminar venta B2B"
        message={
          ventaToDelete
            ? `¿Eliminar la venta ${ventaToDelete.numero}? Esta acción borra la venta y el PDF del contrato. No se puede deshacer.`
            : ''
        }
        fileName={ventaToDelete?.numero}
        isLoading={deletingVenta}
      />
    </div>
  )
}

export default function Page() {
  return (
    <ProtectedRoute>
      <ClienteB2BDetailPage />
    </ProtectedRoute>
  )
}

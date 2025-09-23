// Funciones para obtener recordatorios específicos del dashboard

export interface DashboardReminder {
  id: string
  type: 'itv_vencida' | 'documentacion_pendiente' | 'cambio_nombre_pendiente'
  title: string
  description: string
  count: number
  priority: 'high' | 'medium' | 'low'
  items: Array<{
    id: number
    referencia: string
    marca: string
    modelo: string
    matricula?: string
    [key: string]: any
  }>
}

// Obtener vehículos con ITV vencida
export async function getVehiculosItvVencida(): Promise<DashboardReminder> {
  try {
    const response = await fetch('/api/vehiculos')
    if (!response.ok) throw new Error('Error al obtener vehículos')

    const data = await response.json()
    const vehiculos = data.vehiculos || data // Compatibilidad con diferentes formatos

    // Filtrar vehículos con ITV vencida
    const itvVencida = vehiculos.filter((v: any) => {
      // Si no tiene ITV o dice "No", considerarlo vencido
      if (!v.itv || v.itv === 'No' || v.itv === 'NO') return true

      // Si tiene fecha de ITV, verificar si está vencida
      if (v.fechaItv) {
        const fechaItv = new Date(v.fechaItv)
        const hoy = new Date()
        return fechaItv < hoy
      }

      // Si tiene texto que indica vencimiento
      return (
        v.itv.toLowerCase().includes('vencida') ||
        v.itv.toLowerCase().includes('vencido')
      )
    })

    return {
      id: 'itv-vencida',
      type: 'itv_vencida',
      title: 'ITV Vencida',
      description: `${itvVencida.length} vehículo${itvVencida.length !== 1 ? 's' : ''} ${itvVencida.length === 1 ? 'tiene' : 'tienen'} la ITV vencida`,
      count: itvVencida.length,
      priority: itvVencida.length > 0 ? 'high' : 'low',
      items: itvVencida.map((v: any) => ({
        id: v.id,
        referencia: v.referencia,
        marca: v.marca,
        modelo: v.modelo,
        matricula: v.matricula,
        itv: v.itv,
        fechaItv: v.fechaItv,
      })),
    }
  } catch (error) {
    console.error('Error obteniendo vehículos con ITV vencida:', error)
    return {
      id: 'itv-vencida',
      type: 'itv_vencida',
      title: 'ITV Vencida',
      description: 'Error al verificar ITV',
      count: 0,
      priority: 'low',
      items: [],
    }
  }
}

// Obtener vehículos con documentación pendiente
export async function getVehiculosDocumentacionPendiente(): Promise<DashboardReminder> {
  try {
    const response = await fetch('/api/vehiculos')
    if (!response.ok) throw new Error('Error al obtener vehículos')

    const data = await response.json()
    const vehiculos = data.vehiculos || data // Compatibilidad con diferentes formatos

    // Filtrar vehículos con documentación pendiente (estado "No")
    const docsPendientes = vehiculos.filter((v: any) => {
      return (
        v.documentacion === 'No' ||
        v.documentacion === 'NO' ||
        v.documentacion === false ||
        !v.documentacion
      )
    })

    return {
      id: 'documentacion-pendiente',
      type: 'documentacion_pendiente',
      title: 'Documentación Pendiente',
      description: `${docsPendientes.length} vehículo${docsPendientes.length !== 1 ? 's' : ''} ${docsPendientes.length === 1 ? 'necesita' : 'necesitan'} documentación`,
      count: docsPendientes.length,
      priority: docsPendientes.length > 0 ? 'medium' : 'low',
      items: docsPendientes.map((v: any) => ({
        id: v.id,
        referencia: v.referencia,
        marca: v.marca,
        modelo: v.modelo,
        matricula: v.matricula,
        documentacion: v.documentacion,
      })),
    }
  } catch (error) {
    console.error(
      'Error obteniendo vehículos con documentación pendiente:',
      error
    )
    return {
      id: 'documentacion-pendiente',
      type: 'documentacion_pendiente',
      title: 'Documentación Pendiente',
      description: 'Error al verificar documentación',
      count: 0,
      priority: 'low',
      items: [],
    }
  }
}

// Obtener vehículos facturados que necesitan cambio de nombre
export async function getVehiculosCambioNombrePendiente(): Promise<DashboardReminder> {
  try {
    // Obtener deals facturados
    const response = await fetch('/api/deals')
    if (!response.ok) throw new Error('Error al obtener deals')

    const deals = await response.json()

    // Filtrar deals facturados que NO tienen cambio de nombre solicitado
    const dealsFacturados = deals.filter(
      (d: any) => d.estado === 'facturado' && d.cambioNombreSolicitado !== true
    )

    // Obtener vehículos de estos deals
    const vehiculosFacturados = dealsFacturados.map((d: any) => ({
      id: d.vehiculoId,
      referencia: d.vehiculo?.referencia || `#${d.vehiculoId}`,
      marca: d.vehiculo?.marca || 'N/A',
      modelo: d.vehiculo?.modelo || 'N/A',
      matricula: d.vehiculo?.matricula || 'N/A',
      dealId: d.id,
      dealNumero: d.numero,
      cliente: d.cliente,
      fechaFacturada: d.fechaFacturada,
    }))

    return {
      id: 'cambio-nombre-pendiente',
      type: 'cambio_nombre_pendiente',
      title: 'Cambio de Nombre Pendiente',
      description: `${vehiculosFacturados.length} vehículo${vehiculosFacturados.length !== 1 ? 's' : ''} ${vehiculosFacturados.length === 1 ? 'necesita' : 'necesitan'} cambio de nombre`,
      count: vehiculosFacturados.length,
      priority: vehiculosFacturados.length > 0 ? 'high' : 'low',
      items: vehiculosFacturados,
    }
  } catch (error) {
    console.error('Error obteniendo vehículos para cambio de nombre:', error)
    return {
      id: 'cambio-nombre-pendiente',
      type: 'cambio_nombre_pendiente',
      title: 'Cambio de Nombre Pendiente',
      description: 'Error al verificar cambio de nombre',
      count: 0,
      priority: 'low',
      items: [],
    }
  }
}

// Obtener todos los recordatorios del dashboard
export async function getDashboardReminders(): Promise<DashboardReminder[]> {
  try {
    const [itvReminder, docsReminder, cambioNombreReminder] = await Promise.all(
      [
        getVehiculosItvVencida(),
        getVehiculosDocumentacionPendiente(),
        getVehiculosCambioNombrePendiente(),
      ]
    )

    // Solo devolver recordatorios que tengan elementos
    return [itvReminder, docsReminder, cambioNombreReminder].filter(
      (reminder) => reminder.count > 0
    )
  } catch (error) {
    console.error('Error obteniendo recordatorios del dashboard:', error)
    return []
  }
}

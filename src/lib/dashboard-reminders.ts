// Funciones para obtener recordatorios específicos del dashboard
import { pool } from '@/lib/direct-database'

export interface DashboardReminder {
  id: string
  type:
    | 'itv_vencida'
    | 'seguro_vencido'
    | 'vencimiento_proximo'
    | 'documentacion_pendiente'
    | 'cambio_nombre_pendiente'
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

// Obtener vehículos con ITV vencida. La fecha "itvVence" manda; el string
// libre `itv` solo se mira cuando no hay fecha (fallback histórico).
export async function getVehiculosItvVencida(): Promise<DashboardReminder> {
  try {
    const result = await pool.query(`
      SELECT id, referencia, marca, modelo, matricula, itv,
             "itvVence"::text AS "itvVence"
      FROM "Vehiculo"
      WHERE (
        ("itvVence" IS NOT NULL AND "itvVence" < CURRENT_DATE)
        OR (
          "itvVence" IS NULL AND itv IS NOT NULL
          AND (itv = 'No' OR itv = 'NO' OR itv ILIKE '%vencida%' OR itv ILIKE '%vencido%')
        )
      )
      AND UPPER(TRIM(estado)) NOT IN ('VENDIDO', 'RESERVADO')
      ORDER BY "itvVence" ASC NULLS LAST, "createdAt" DESC
    `)

    const vehiculos = result.rows

    return {
      id: 'itv-vencida',
      type: 'itv_vencida',
      title: 'ITV Vencida o Próxima a Vencer',
      description: `${vehiculos.length} vehículo${vehiculos.length !== 1 ? 's' : ''} ${vehiculos.length === 1 ? 'tiene' : 'tienen'} la ITV vencida o próxima a vencer`,
      count: vehiculos.length,
      priority: vehiculos.length > 0 ? 'high' : 'low',
      items: vehiculos.map((v) => ({
        id: v.id,
        referencia: v.referencia,
        marca: v.marca,
        modelo: v.modelo,
        matricula: v.matricula,
        itv: v.itv,
        itvVence: v.itvVence,
      })),
    }
  } catch (error) {
    console.error('Error obteniendo vehículos con ITV vencida:', error)
    return {
      id: 'itv-vencida',
      type: 'itv_vencida',
      title: 'ITV Vencida o Próxima a Vencer',
      description: 'Error al verificar ITV',
      count: 0,
      priority: 'low',
      items: [],
    }
  }
}

// Obtener vehículos con seguro vencido (solo por fecha: el string `seguro`
// no distingue "sin seguro" de "vencido").
export async function getVehiculosSeguroVencido(): Promise<DashboardReminder> {
  const base = {
    id: 'seguro-vencido',
    type: 'seguro_vencido' as const,
    title: 'Seguro vencido',
  }
  try {
    const result = await pool.query(`
      SELECT id, referencia, marca, modelo, matricula, seguro,
             "seguroVence"::text AS "seguroVence"
      FROM "Vehiculo"
      WHERE "seguroVence" IS NOT NULL AND "seguroVence" < CURRENT_DATE
      AND UPPER(TRIM(estado)) NOT IN ('VENDIDO', 'RESERVADO')
      ORDER BY "seguroVence" ASC
    `)

    const vehiculos = result.rows

    return {
      ...base,
      description: `${vehiculos.length} vehículo${vehiculos.length !== 1 ? 's' : ''} ${vehiculos.length === 1 ? 'tiene' : 'tienen'} el seguro vencido`,
      count: vehiculos.length,
      priority: vehiculos.length > 0 ? 'high' : 'low',
      items: vehiculos.map((v) => ({
        id: v.id,
        referencia: v.referencia,
        marca: v.marca,
        modelo: v.modelo,
        matricula: v.matricula,
        seguro: v.seguro,
        seguroVence: v.seguroVence,
      })),
    }
  } catch (error) {
    console.error('Error obteniendo vehículos con seguro vencido:', error)
    return {
      ...base,
      description: 'Error al verificar seguro',
      count: 0,
      priority: 'low',
      items: [],
    }
  }
}

// Obtener vehículos con ITV, seguro o garantía que vencen en los próximos 30 días
export async function getVehiculosVencimientoProximo(): Promise<DashboardReminder> {
  const base = {
    id: 'vencimiento-proximo',
    type: 'vencimiento_proximo' as const,
    title: 'ITV / seguro / garantía a punto de vencer',
  }
  try {
    const result = await pool.query(`
      SELECT id, referencia, marca, modelo, matricula,
             "itvVence"::text AS "itvVence",
             "seguroVence"::text AS "seguroVence",
             "garantiaVence"::text AS "garantiaVence"
      FROM "Vehiculo"
      WHERE (
        "itvVence" BETWEEN CURRENT_DATE AND CURRENT_DATE + 30
        OR "seguroVence" BETWEEN CURRENT_DATE AND CURRENT_DATE + 30
        OR "garantiaVence" BETWEEN CURRENT_DATE AND CURRENT_DATE + 30
      )
      AND UPPER(TRIM(estado)) NOT IN ('VENDIDO', 'RESERVADO')
      ORDER BY LEAST("itvVence", "seguroVence", "garantiaVence") ASC
    `)

    const vehiculos = result.rows

    return {
      ...base,
      description: `${vehiculos.length} vehículo${vehiculos.length !== 1 ? 's' : ''} con ITV, seguro o garantía que vence en menos de 30 días`,
      count: vehiculos.length,
      priority: vehiculos.length > 0 ? 'medium' : 'low',
      items: vehiculos.map((v) => ({
        id: v.id,
        referencia: v.referencia,
        marca: v.marca,
        modelo: v.modelo,
        matricula: v.matricula,
        itvVence: v.itvVence,
        seguroVence: v.seguroVence,
        garantiaVence: v.garantiaVence,
      })),
    }
  } catch (error) {
    console.error('Error obteniendo vencimientos próximos:', error)
    return {
      ...base,
      description: 'Error al verificar vencimientos',
      count: 0,
      priority: 'low',
      items: [],
    }
  }
}

// Obtener vehículos con documentación pendiente
export async function getVehiculosDocumentacionPendiente(): Promise<DashboardReminder> {
  try {
    const result = await pool.query(`
      SELECT id, referencia, marca, modelo, matricula, documentacion
      FROM "Vehiculo"
      WHERE (documentacion IS NULL OR documentacion = 'No' OR documentacion = 'NO' OR documentacion = '')
      AND UPPER(TRIM(estado)) NOT IN ('VENDIDO', 'RESERVADO')
      ORDER BY "createdAt" DESC
    `)

    const vehiculos = result.rows

    return {
      id: 'documentacion-pendiente',
      type: 'documentacion_pendiente',
      title: 'Documentación Pendiente',
      description: `${vehiculos.length} vehículo${vehiculos.length !== 1 ? 's' : ''} ${vehiculos.length === 1 ? 'necesita' : 'necesitan'} documentación`,
      count: vehiculos.length,
      priority: vehiculos.length > 0 ? 'medium' : 'low',
      items: vehiculos.map((v) => ({
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
    const result = await pool.query(`
      SELECT 
        d.id as "dealId",
        d.numero as "dealNumero",
        d."fechaFacturada",
        d."cambioNombreSolicitado",
        v.id as "vehiculoId",
        v.referencia,
        v.marca,
        v.modelo,
        v.matricula,
        c.nombre as "clienteNombre",
        c.apellidos as "clienteApellidos"
      FROM "Deal" d
      JOIN "Vehiculo" v ON d."vehiculoId" = v.id
      JOIN "Cliente" c ON d."clienteId" = c.id
      WHERE d.estado = 'facturado' 
      AND (d."cambioNombreSolicitado" IS NULL OR d."cambioNombreSolicitado" = false)
      ORDER BY d."fechaFacturada" DESC
    `)

    const vehiculosFacturados = result.rows.map((row: any) => ({
      id: row.vehiculoId,
      referencia: row.referencia,
      marca: row.marca,
      modelo: row.modelo,
      matricula: row.matricula,
      dealId: row.dealId,
      dealNumero: row.dealNumero,
      cliente: {
        nombre: row.clienteNombre,
        apellidos: row.clienteApellidos,
      },
      fechaFacturada: row.fechaFacturada,
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
    // Secuencial a propósito: el pool compartido tiene max 3; en paralelo una sola
    // request ocupaba los 3 slots y bloqueaba cualquier otra query concurrente.
    const itvReminder = await getVehiculosItvVencida()
    const seguroReminder = await getVehiculosSeguroVencido()
    const proximosReminder = await getVehiculosVencimientoProximo()
    const docsReminder = await getVehiculosDocumentacionPendiente()
    const cambioNombreReminder = await getVehiculosCambioNombrePendiente()

    // Solo devolver recordatorios que tengan elementos
    return [
      itvReminder,
      seguroReminder,
      proximosReminder,
      docsReminder,
      cambioNombreReminder,
    ].filter((reminder) => reminder.count > 0)
  } catch (error) {
    console.error('Error obteniendo recordatorios del dashboard:', error)
    return []
  }
}

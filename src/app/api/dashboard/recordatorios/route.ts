import { NextResponse } from 'next/server'
import { pool } from '@/lib/direct-database'

export async function GET() {
  try {
    console.log(
      '📅 [DASHBOARD RECORDATORIOS] Obteniendo todos los recordatorios'
    )

    const client = await pool.connect()
    const todosRecordatorios: any[] = []

    try {
      // Obtener recordatorios de deals (si la tabla existe)
      try {
        const dealsRecordatorios = await client.query(`
          SELECT 
            dr.*,
            'deal' as tipo_entidad,
            d.numero as entidad_numero,
            c.nombre as cliente_nombre,
            c.apellidos as cliente_apellidos,
            v.marca as vehiculo_marca,
            v.modelo as vehiculo_modelo
          FROM DealRecordatorios dr
          LEFT JOIN "Deal" d ON dr.deal_id = d.id
          LEFT JOIN "Cliente" c ON d."clienteId" = c.id
          LEFT JOIN "Vehiculo" v ON d."vehiculoId" = v.id
          WHERE dr.completado = false
          ORDER BY dr.fecha_recordatorio ASC
        `)

        todosRecordatorios.push(
          ...dealsRecordatorios.rows.map((row) => ({
            ...row,
            fecha_recordatorio: row.fecha_recordatorio,
            created_at: row.created_at,
          }))
        )
      } catch (err) {
        console.log(
          '⚠️ [DASHBOARD RECORDATORIOS] Tabla DealRecordatorios no existe o tiene error:',
          err
        )
      }

      // Obtener recordatorios de vehículos (si la tabla existe)
      try {
        const vehiculosRecordatorios = await client.query(`
          SELECT 
            vr.*,
            'vehiculo' as tipo_entidad,
            v.referencia as entidad_numero,
            v.marca as vehiculo_marca,
            v.modelo as vehiculo_modelo,
            NULL as cliente_nombre,
            NULL as cliente_apellidos
          FROM VehiculoRecordatorios vr
          LEFT JOIN "Vehiculo" v ON vr.vehiculo_id = v.id
          WHERE vr.completado = false
          ORDER BY vr.fecha_recordatorio ASC
        `)

        todosRecordatorios.push(
          ...vehiculosRecordatorios.rows.map((row) => ({
            ...row,
            fecha_recordatorio: row.fecha_recordatorio,
            created_at: row.created_at,
          }))
        )
      } catch (err) {
        console.log(
          '⚠️ [DASHBOARD RECORDATORIOS] Tabla VehiculoRecordatorios no existe o tiene error:',
          err
        )
      }

      // Obtener recordatorios de clientes (si la tabla existe)
      try {
        const clientesRecordatorios = await client.query(`
          SELECT 
            cr.*,
            'cliente' as tipo_entidad,
            c.nombre as cliente_nombre,
            c.apellidos as cliente_apellidos,
            NULL as entidad_numero,
            NULL as vehiculo_marca,
            NULL as vehiculo_modelo
          FROM "ClienteReminder" cr
          LEFT JOIN "Cliente" c ON cr."clienteId" = c.id
          WHERE cr.completado = false
          ORDER BY cr."fechaRecordatorio" ASC
        `)

        todosRecordatorios.push(
          ...clientesRecordatorios.rows.map((row) => ({
            ...row,
            fecha_recordatorio: row.fechaRecordatorio,
            created_at: row.createdAt,
          }))
        )
      } catch (err) {
        console.log(
          '⚠️ [DASHBOARD RECORDATORIOS] Tabla ClienteReminder no existe o tiene error:',
          err
        )
      }

      // Obtener recordatorios de depósitos (si la tabla existe)
      try {
        const depositosRecordatorios = await client.query(`
          SELECT 
            dr.*,
            'deposito' as tipo_entidad,
            d.id as entidad_numero,
            NULL as cliente_nombre,
            NULL as cliente_apellidos,
            NULL as vehiculo_marca,
            NULL as vehiculo_modelo
          FROM DepositoRecordatorios dr
          LEFT JOIN depositos d ON dr.deposito_id = d.id
          WHERE dr.completado = false
          ORDER BY dr.fecha_recordatorio ASC
        `)

        todosRecordatorios.push(
          ...depositosRecordatorios.rows.map((row) => ({
            ...row,
            fecha_recordatorio: row.fecha_recordatorio,
            created_at: row.created_at,
          }))
        )
      } catch (err) {
        console.log(
          '⚠️ [DASHBOARD RECORDATORIOS] Tabla DepositoRecordatorios no existe o tiene error:',
          err
        )
      }

      // Obtener recordatorios de inversores (si la tabla existe)
      try {
        const inversoresRecordatorios = await client.query(`
          SELECT 
            ir.*,
            'inversor' as tipo_entidad,
            i.id as entidad_numero,
            i.nombre as cliente_nombre,
            NULL as cliente_apellidos,
            NULL as vehiculo_marca,
            NULL as vehiculo_modelo
          FROM "InversorRecordatorios" ir
          LEFT JOIN "Inversor" i ON ir.inversor_id = i.id
          WHERE ir.completado = false
          ORDER BY ir.fecha_recordatorio ASC
        `)

        todosRecordatorios.push(
          ...inversoresRecordatorios.rows.map((row) => ({
            ...row,
            fecha_recordatorio: row.fecha_recordatorio,
            created_at: row.created_at,
          }))
        )
      } catch (err) {
        console.log(
          '⚠️ [DASHBOARD RECORDATORIOS] Tabla InversorRecordatorios no existe o tiene error:',
          err
        )
      }
    } finally {
      client.release()
    }

    // Ordenar por fecha
    todosRecordatorios.sort(
      (a, b) =>
        new Date(a.fecha_recordatorio).getTime() -
        new Date(b.fecha_recordatorio).getTime()
    )

    console.log(
      `✅ [DASHBOARD RECORDATORIOS] Encontrados ${todosRecordatorios.length} recordatorios`
    )
    return NextResponse.json(todosRecordatorios)
  } catch (error) {
    console.error(
      '❌ [DASHBOARD RECORDATORIOS] Error al obtener recordatorios:',
      error
    )
    return NextResponse.json(
      { error: 'Error interno del servidor' },
      { status: 500 }
    )
  }
}

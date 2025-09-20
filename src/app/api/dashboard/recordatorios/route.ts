import { NextResponse } from 'next/server'
import { pool } from '@/lib/direct-database'

export async function GET() {
  try {
    console.log('📅 [DASHBOARD RECORDATORIOS] Obteniendo todos los recordatorios')

    const client = await pool.connect()
    
    // Obtener recordatorios de deals
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
    
    // Obtener recordatorios de vehículos
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
    
    // Obtener recordatorios de clientes
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
    
    client.release()
    
    // Combinar todos los recordatorios
    const todosRecordatorios = [
      ...dealsRecordatorios.rows.map(row => ({
        ...row,
        fecha_recordatorio: row.fecha_recordatorio,
        created_at: row.created_at
      })),
      ...vehiculosRecordatorios.rows.map(row => ({
        ...row,
        fecha_recordatorio: row.fecha_recordatorio,
        created_at: row.created_at
      })),
      ...clientesRecordatorios.rows.map(row => ({
        ...row,
        fecha_recordatorio: row.fechaRecordatorio,
        created_at: row.createdAt
      }))
    ]
    
    // Ordenar por fecha
    todosRecordatorios.sort((a, b) => 
      new Date(a.fecha_recordatorio).getTime() - new Date(b.fecha_recordatorio).getTime()
    )
    
    console.log(`✅ [DASHBOARD RECORDATORIOS] Encontrados ${todosRecordatorios.length} recordatorios`)
    return NextResponse.json(todosRecordatorios)
  } catch (error) {
    console.error('❌ [DASHBOARD RECORDATORIOS] Error al obtener recordatorios:', error)
    return NextResponse.json({ error: 'Error interno del servidor' }, { status: 500 })
  }
}

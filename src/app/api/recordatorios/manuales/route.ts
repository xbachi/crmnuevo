import { NextResponse } from 'next/server'
import { pool } from '@/lib/direct-database'

export async function GET() {
  const client = await pool.connect()
  try {
    // Obtener recordatorios manuales de la tabla Recordatorio
    const result = await client.query(`
      SELECT 
        r.id,
        r.titulo,
        r.descripcion,
        r.prioridad,
        r."fechaVencimiento" as fecha_vencimiento,
        r.fuente as pagina_origen,
        r."createdAt" as created_at,
        r."updatedAt" as updated_at,
        c.nombre as cliente_nombre,
        r."vehiculoId" as vehiculo_id,
        v.referencia as vehiculo_referencia,
        v.marca as vehiculo_marca,
        v.modelo as vehiculo_modelo,
        v.matricula as vehiculo_matricula
      FROM "Recordatorio" r
      LEFT JOIN "Cliente" c ON r."clienteId" = c.id
      LEFT JOIN "Vehiculo" v ON r."vehiculoId" = v.id
      WHERE r.completado = false OR r.completado IS NULL
      ORDER BY r.prioridad DESC, r."createdAt" DESC
    `)

    const recordatoriosManuales = result.rows.map((recordatorio) => {
      // Generar slug del vehículo si existe
      let vehiculo_slug = null
      if (
        recordatorio.vehiculo_id &&
        recordatorio.vehiculo_marca &&
        recordatorio.vehiculo_modelo
      ) {
        const cleanMarca = recordatorio.vehiculo_marca
          .toLowerCase()
          .replace(/[^a-z0-9]/g, '')
        const cleanModelo = recordatorio.vehiculo_modelo
          .toLowerCase()
          .replace(/[^a-z0-9]/g, '')
        vehiculo_slug = `${recordatorio.vehiculo_id}-${cleanMarca}-${cleanModelo}`
      }

      return {
        id: recordatorio.id,
        titulo: recordatorio.titulo,
        descripcion: recordatorio.descripcion,
        prioridad: recordatorio.prioridad || 'media',
        fecha_vencimiento: recordatorio.fecha_vencimiento,
        pagina_origen: recordatorio.pagina_origen || 'dashboard',
        tipo: recordatorio.tipo || 'manual',
        created_at: recordatorio.created_at,
        updated_at: recordatorio.updated_at,
        es_importante: false,
        categoria: 'manual',
        cliente_nombre: recordatorio.cliente_nombre,
        vehiculo_id: recordatorio.vehiculo_id,
        vehiculo_referencia: recordatorio.vehiculo_referencia,
        vehiculo_marca: recordatorio.vehiculo_marca,
        vehiculo_modelo: recordatorio.vehiculo_modelo,
        vehiculo_matricula: recordatorio.vehiculo_matricula,
        vehiculo_slug: vehiculo_slug,
      }
    })

    return NextResponse.json(recordatoriosManuales)
  } catch (error) {
    console.error('Error fetching manual reminders:', error)
    return NextResponse.json(
      { error: 'Error al obtener recordatorios manuales' },
      { status: 500 }
    )
  } finally {
    client.release()
  }
}

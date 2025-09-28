import { NextResponse } from 'next/server'
import { getDashboardReminders } from '@/lib/dashboard-reminders'

export async function GET() {
  try {
    console.log(
      '🔍 [API RECORDATORIOS] Iniciando obtención de recordatorios...'
    )

    // Obtener recordatorios del dashboard (importantes)
    const dashboardReminders = await getDashboardReminders()
    console.log(
      '📊 [API RECORDATORIOS] Dashboard reminders:',
      dashboardReminders.length
    )

    // Transformar los recordatorios del dashboard a un formato unificado
    const dashboardRecordatorios = dashboardReminders.flatMap((reminder) =>
      reminder.items.map((item, index) => {
        // Crear títulos y descripciones específicas por vehículo
        let titulo = ''
        let descripcion = ''

        if (reminder.type === 'itv_vencida') {
          titulo = `ITV Vencida - ${item.marca} ${item.modelo}`
          descripcion = `Vehículo ${item.referencia} (${item.matricula || 'Sin matrícula'}) tiene la ITV vencida`
        } else if (reminder.type === 'documentacion_pendiente') {
          titulo = `Documentación Pendiente - ${item.marca} ${item.modelo}`
          descripcion = `Vehículo ${item.referencia} (${item.matricula || 'Sin matrícula'}) necesita documentación`
        } else if (reminder.type === 'cambio_nombre_pendiente') {
          titulo = `Cambio de Nombre Pendiente - ${item.marca} ${item.modelo}`
          descripcion = `Vehículo ${item.referencia} (${item.matricula || 'Sin matrícula'}) necesita cambio de nombre`
        } else {
          titulo = reminder.title
          descripcion = reminder.description
        }

        // Generar slug del vehículo
        let vehiculo_slug = null
        if (item.id && item.marca && item.modelo) {
          const cleanMarca = item.marca.toLowerCase().replace(/[^a-z0-9]/g, '')
          const cleanModelo = item.modelo
            .toLowerCase()
            .replace(/[^a-z0-9]/g, '')
          vehiculo_slug = `${item.id}-${cleanMarca}-${cleanModelo}`
        }

        return {
          id: `${reminder.id}-${item.id}`,
          titulo,
          descripcion,
          prioridad:
            reminder.priority === 'high'
              ? 'alta'
              : reminder.priority === 'medium'
                ? 'media'
                : 'baja',
          fecha_vencimiento: item.fechaVencimiento || new Date().toISOString(),
          pagina_origen:
            reminder.type === 'itv_vencida' ||
            reminder.type === 'documentacion_pendiente'
              ? 'vehiculos'
              : reminder.type === 'cambio_nombre_pendiente'
                ? 'deals'
                : 'dashboard',
          tipo: reminder.type,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          es_importante: true,
          categoria:
            reminder.type === 'itv_vencida'
              ? 'itv'
              : reminder.type === 'documentacion_pendiente'
                ? 'documentacion'
                : reminder.type === 'cambio_nombre_pendiente'
                  ? 'cambio_nombre'
                  : 'otros',
          // Agregar información del vehículo para el enlace
          vehiculo_id: item.id,
          vehiculo_referencia: item.referencia,
          vehiculo_marca: item.marca,
          vehiculo_modelo: item.modelo,
          vehiculo_matricula: item.matricula,
          vehiculo_slug: vehiculo_slug,
        }
      })
    )

    // Obtener recordatorios manuales de todas las tablas específicas
    const { pool } = await import('@/lib/direct-database')
    const client = await pool.connect()
    let recordatoriosManuales: any[] = []

    try {
      // 1. ClienteReminder
      try {
        const clienteReminders = await client.query(`
          SELECT 
            cr.id,
            cr.titulo,
            cr.descripcion,
            cr.prioridad,
            cr."fechaRecordatorio" as fecha_vencimiento,
            'clientes' as pagina_origen,
            cr."createdAt" as created_at,
            cr."updatedAt" as updated_at,
            c.nombre as cliente_nombre,
            cr."clienteId" as clienteId,
            NULL as vehiculo_id,
            NULL as vehiculo_referencia,
            NULL as vehiculo_marca,
            NULL as vehiculo_modelo,
            NULL as vehiculo_matricula
          FROM "ClienteReminder" cr
          LEFT JOIN "Cliente" c ON cr."clienteId" = c.id
          WHERE cr.completado = false OR cr.completado IS NULL
        `)

        recordatoriosManuales.push(
          ...clienteReminders.rows.map((recordatorio) => ({
            ...recordatorio,
            tipo: 'cliente_reminder',
            es_importante: false,
            categoria: 'manuales_clientes',
            vehiculo_slug: null,
            cliente_id: recordatorio.clienteId,
            cliente_slug: recordatorio.clienteId
              ? `cliente-${recordatorio.clienteId}`
              : null,
          }))
        )
      } catch (error) {
        console.error('Error fetching ClienteReminder:', error)
      }

      // 2. DepositoRecordatorios
      try {
        const depositoRecordatorios = await client.query(`
          SELECT 
            dr.id,
            dr.titulo,
            dr.descripcion,
            dr.prioridad,
            dr.fecha_recordatorio as fecha_vencimiento,
            'depositos' as pagina_origen,
            dr.created_at,
            dr.updated_at,
            NULL as cliente_nombre,
            NULL as vehiculo_id,
            NULL as vehiculo_referencia,
            NULL as vehiculo_marca,
            NULL as vehiculo_modelo,
            NULL as vehiculo_matricula
          FROM "DepositoRecordatorios" dr
          WHERE dr.completado = false OR dr.completado IS NULL
        `)

        recordatoriosManuales.push(
          ...depositoRecordatorios.rows.map((recordatorio) => ({
            ...recordatorio,
            tipo: 'deposito_recordatorio',
            es_importante: false,
            categoria: 'manuales_depositos',
            vehiculo_slug: null,
            deposito_id: recordatorio.deposito_id,
            deposito_slug: recordatorio.deposito_id
              ? `deposito-${recordatorio.deposito_id}`
              : null,
          }))
        )
      } catch (error) {
        console.error('Error fetching DepositoRecordatorios:', error)
      }

      // 3. InversorRecordatorios
      try {
        const inversorRecordatorios = await client.query(`
          SELECT 
            ir.id,
            ir.titulo,
            ir.descripcion,
            ir.prioridad,
            ir.fecha_recordatorio as fecha_vencimiento,
            'inversores' as pagina_origen,
            ir.created_at,
            ir.updated_at,
            i.nombre as cliente_nombre,
            NULL as vehiculo_id,
            NULL as vehiculo_referencia,
            NULL as vehiculo_marca,
            NULL as vehiculo_modelo,
            NULL as vehiculo_matricula
          FROM "InversorRecordatorios" ir
          LEFT JOIN "Inversor" i ON ir.inversor_id = i.id
          WHERE ir.completado = false OR ir.completado IS NULL
        `)

        recordatoriosManuales.push(
          ...inversorRecordatorios.rows.map((recordatorio) => ({
            ...recordatorio,
            tipo: 'inversor_recordatorio',
            es_importante: false,
            categoria: 'manuales_inversores',
            vehiculo_slug: null,
            inversor_id: recordatorio.inversor_id,
            inversor_slug: recordatorio.inversor_id
              ? `inversor-${recordatorio.inversor_id}`
              : null,
          }))
        )
      } catch (error) {
        console.error('Error fetching InversorRecordatorios:', error)
      }

      // 4. VehiculoRecordatorios
      try {
        const vehiculoRecordatorios = await client.query(`
          SELECT 
            vr.id,
            vr.titulo,
            vr.descripcion,
            vr.prioridad,
            vr.fecha_recordatorio as fecha_vencimiento,
            'vehiculos' as pagina_origen,
            vr.created_at,
            vr.updated_at,
            NULL as cliente_nombre,
            v.id as vehiculo_id,
            v.referencia as vehiculo_referencia,
            v.marca as vehiculo_marca,
            v.modelo as vehiculo_modelo,
            v.matricula as vehiculo_matricula
          FROM "VehiculoRecordatorios" vr
          LEFT JOIN "Vehiculo" v ON vr.vehiculo_id = v.id
          WHERE vr.completado = false OR vr.completado IS NULL
        `)

        recordatoriosManuales.push(
          ...vehiculoRecordatorios.rows.map((recordatorio) => {
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
              ...recordatorio,
              tipo: 'vehiculo_recordatorio',
              es_importante: false,
              categoria: 'manuales_vehiculos',
              vehiculo_slug: vehiculo_slug,
              vehiculo_id: recordatorio.vehiculo_id,
            }
          })
        )
      } catch (error) {
        console.error('Error fetching VehiculoRecordatorios:', error)
      }

      // 5. dealrecordatorios
      try {
        const dealRecordatorios = await client.query(`
          SELECT 
            dr.id,
            dr.titulo,
            dr.descripcion,
            dr.prioridad,
            dr.fecha_recordatorio as fecha_vencimiento,
            'deals' as pagina_origen,
            dr.created_at,
            dr.updated_at,
            c.nombre as cliente_nombre,
            v.id as vehiculo_id,
            v.referencia as vehiculo_referencia,
            v.marca as vehiculo_marca,
            v.modelo as vehiculo_modelo,
            v.matricula as vehiculo_matricula
          FROM dealrecordatorios dr
          LEFT JOIN "Deal" d ON dr.deal_id = d.id
          LEFT JOIN "Cliente" c ON d."clienteId" = c.id
          LEFT JOIN "Vehiculo" v ON d."vehiculoId" = v.id
          WHERE dr.completado = false OR dr.completado IS NULL
        `)

        recordatoriosManuales.push(
          ...dealRecordatorios.rows.map((recordatorio) => {
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
              ...recordatorio,
              tipo: 'deal_recordatorio',
              es_importante: false,
              categoria: 'manuales_deals',
              vehiculo_slug: vehiculo_slug,
              vehiculo_id: recordatorio.vehiculo_id,
              deal_id: recordatorio.deal_id,
              deal_slug: recordatorio.deal_id
                ? `deal-${recordatorio.deal_id}`
                : null,
            }
          })
        )
      } catch (error) {
        console.error('Error fetching dealrecordatorios:', error)
      }
    } catch (error) {
      console.error('Error fetching manual reminders:', error)
    } finally {
      client.release()
    }

    console.log(
      '📝 [API RECORDATORIOS] Manual reminders:',
      recordatoriosManuales.length
    )

    // Combinar todos los recordatorios
    const todosLosRecordatorios = [
      ...dashboardRecordatorios,
      ...recordatoriosManuales,
    ]

    console.log(
      '✅ [API RECORDATORIOS] Total recordatorios:',
      todosLosRecordatorios.length
    )

    return NextResponse.json(todosLosRecordatorios)
  } catch (error) {
    console.error('Error fetching reminders:', error)
    return NextResponse.json(
      { error: 'Error al obtener recordatorios' },
      { status: 500 }
    )
  }
}

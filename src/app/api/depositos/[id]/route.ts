import { NextRequest, NextResponse } from 'next/server'
import { pool } from '@/lib/direct-database'

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    
    const result = await pool.query(`
      SELECT
        d.*,
        c.id as cliente_id, c.nombre, c.apellidos, c.email, c.telefono, c.dni, c.direccion, c.ciudad, c.provincia,
        v.id as vehiculo_id, v.referencia, v.marca, v.modelo, v.matricula, v.tipo, v.bastidor, v.kms, v."fechaMatriculacion"
      FROM depositos d
      JOIN "Cliente" c ON d.cliente_id = c.id
      JOIN "Vehiculo" v ON d.vehiculo_id = v.id
      WHERE d.id = $1
    `, [id])

    if (result.rows.length === 0) {
      return NextResponse.json({ error: 'Depósito no encontrado' }, { status: 404 })
    }

    const row = result.rows[0]
    const deposito = {
      id: row.id,
      cliente_id: row.cliente_id,
      vehiculo_id: row.vehiculo_id,
      estado: row.estado,
      fecha_inicio: row.fecha_inicio,
      fecha_fin: row.fecha_fin,
      precio_venta: row.precio_venta,
      comision_porcentaje: row.comision_porcentaje,
      notas: row.notas,
      monto_recibir: row.monto_recibir,
      dias_gestion: row.dias_gestion,
      multa_retiro_anticipado: row.multa_retiro_anticipado,
      numero_cuenta: row.numero_cuenta,
      contrato_deposito: row.contrato_deposito || null,
      contrato_compra: row.contrato_compra || null,
      created_at: row.created_at,
      cliente: {
        id: row.cliente_id,
        nombre: row.nombre,
        apellidos: row.apellidos,
        email: row.email,
        telefono: row.telefono,
        dni: row.dni,
        direccion: row.direccion,
        ciudad: row.ciudad,
        provincia: row.provincia
      },
      vehiculo: {
        id: row.vehiculo_id,
        referencia: row.referencia,
        marca: row.marca,
        modelo: row.modelo,
        matricula: row.matricula,
        tipo: row.tipo,
        bastidor: row.bastidor,
        kms: row.kms,
        fechaMatriculacion: row.fechaMatriculacion
      }
    }

    return NextResponse.json(deposito)
  } catch (error) {
    console.error('Error fetching deposito:', error)
    return NextResponse.json({ error: 'Error interno del servidor' }, { status: 500 })
  }
}

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const body = await request.json()
    
    console.log(`📝 PUT depósito ${id}`)
    console.log(`📊 Body completo recibido:`, JSON.stringify(body, null, 2))
    
    const { 
      estado, 
      fecha_fin, 
      precio_venta, 
      comision_porcentaje, 
      notas,
      monto_recibir,
      dias_gestion,
      multa_retiro_anticipado,
      numero_cuenta,
      contrato_deposito,
      contrato_compra
    } = body
    
    console.log(`📝 Campos extraídos:`, {
      estado, fecha_fin, precio_venta, comision_porcentaje, notas,
      monto_recibir, dias_gestion, multa_retiro_anticipado, numero_cuenta,
      contrato_deposito, contrato_compra
    })

    // Calcular nueva fecha de fin si se actualizan los días de gestión
    let nueva_fecha_fin = fecha_fin
    if (dias_gestion) {
      // Obtener la fecha de inicio del depósito
      const depositoActual = await pool.query('SELECT fecha_inicio FROM depositos WHERE id = $1', [id])
      if (depositoActual.rows.length > 0) {
        const fechaInicio = new Date(depositoActual.rows[0].fecha_inicio)
        fechaInicio.setDate(fechaInicio.getDate() + parseInt(dias_gestion))
        nueva_fecha_fin = fechaInicio.toISOString().split('T')[0]
      }
    }

    // Si solo se está actualizando el estado, hacer una actualización simple
    if (Object.keys(body).length === 1 && body.estado) {
      console.log(`🔄 Actualización simple de estado a: ${estado}`)
      
      const result = await pool.query(`
        UPDATE depositos 
        SET estado = $1, updated_at = CURRENT_TIMESTAMP
        WHERE id = $2
        RETURNING *
      `, [estado, id])
      
      console.log(`✅ Query simple ejecutado, filas afectadas: ${result.rows.length}`)
      
      if (result.rows.length === 0) {
        console.log(`❌ Depósito ${id} no encontrado`)
        return NextResponse.json({ error: 'Depósito no encontrado' }, { status: 404 })
      }

      console.log(`✅ Estado actualizado exitosamente:`, result.rows[0])
      return NextResponse.json(result.rows[0])
    }

    // Actualización completa
    console.log(`🔄 Ejecutando actualización completa con valores:`, [
      estado, nueva_fecha_fin, monto_recibir, dias_gestion, 
      multa_retiro_anticipado, numero_cuenta, notas, contrato_deposito, contrato_compra, id
    ])
    
    const result = await pool.query(`
      UPDATE depositos 
      SET estado = $1, fecha_fin = $2, monto_recibir = $3, dias_gestion = $4, 
          multa_retiro_anticipado = $5, numero_cuenta = $6, notas = $7, 
          contrato_deposito = $8, contrato_compra = $9, updated_at = CURRENT_TIMESTAMP
      WHERE id = $10
      RETURNING *
    `, [estado, nueva_fecha_fin, monto_recibir, dias_gestion, multa_retiro_anticipado, numero_cuenta, notas, contrato_deposito, contrato_compra, id])

    console.log(`✅ Query completo ejecutado, filas afectadas: ${result.rows.length}`)

    if (result.rows.length === 0) {
      console.log(`❌ Depósito ${id} no encontrado en actualización completa`)
      return NextResponse.json({ error: 'Depósito no encontrado' }, { status: 404 })
    }

    console.log(`✅ Depósito actualizado exitosamente:`, result.rows[0])
    return NextResponse.json(result.rows[0])
  } catch (error) {
    console.error('❌ Error updating deposito:', error)
    console.error('❌ Error stack:', error.stack)
    console.error('❌ Error code:', error.code)
    return NextResponse.json({ 
      error: 'Error interno del servidor',
      details: error.message,
      code: error.code
    }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const result = await pool.query('DELETE FROM depositos WHERE id = $1 RETURNING *', [id])

    if (result.rows.length === 0) {
      return NextResponse.json({ error: 'Depósito no encontrado' }, { status: 404 })
    }

    return NextResponse.json({ message: 'Depósito eliminado exitosamente' })
  } catch (error) {
    console.error('Error deleting deposito:', error)
    return NextResponse.json({ error: 'Error interno del servidor' }, { status: 500 })
  }
}

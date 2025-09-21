import { NextResponse } from 'next/server'
import { pool } from '@/lib/direct-database'

export async function GET() {
  try {
    console.log('🧪 [QA DEPOSITO RECORDATORIOS] Iniciando test de recordatorios')
    
    const client = await pool.connect()
    
    // 1. Verificar que la tabla existe
    console.log('1️⃣ Verificando tabla DepositoRecordatorios...')
    const tableCheck = await client.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_name = 'depositorecordatorios'
      )
    `)
    
    if (!tableCheck.rows[0].exists) {
      client.release()
      return NextResponse.json({ 
        error: 'Tabla DepositoRecordatorios no existe',
        step: 'table_check'
      }, { status: 500 })
    }
    
    console.log('✅ Tabla DepositoRecordatorios existe')
    
    // 2. Obtener un depósito existente
    console.log('2️⃣ Obteniendo depósito existente...')
    const depositoResult = await client.query(`
      SELECT id FROM depositos LIMIT 1
    `)
    
    if (depositoResult.rows.length === 0) {
      client.release()
      return NextResponse.json({ 
        error: 'No hay depósitos en la base de datos',
        step: 'deposito_check'
      }, { status: 500 })
    }
    
    const depositoId = depositoResult.rows[0].id
    console.log(`✅ Depósito encontrado: ${depositoId}`)
    
    // 3. Crear un recordatorio de prueba
    console.log('3️⃣ Creando recordatorio de prueba...')
    const testRecordatorio = {
      titulo: 'Test QA Recordatorio',
      descripcion: 'Recordatorio creado por QA test',
      tipo: 'llamada',
      prioridad: 'alta',
      fechaRecordatorio: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString() // Mañana
    }
    
    const insertResult = await client.query(`
      INSERT INTO DepositoRecordatorios (deposito_id, titulo, descripcion, tipo, prioridad, fecha_recordatorio, completado, created_at, updated_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7, NOW(), NOW())
      RETURNING 
        id,
        deposito_id as "depositoId",
        titulo,
        descripcion,
        tipo,
        prioridad,
        fecha_recordatorio as "fechaRecordatorio",
        completado,
        created_at as "createdAt",
        updated_at as "updatedAt"
    `, [
      depositoId,
      testRecordatorio.titulo,
      testRecordatorio.descripcion,
      testRecordatorio.tipo,
      testRecordatorio.prioridad,
      testRecordatorio.fechaRecordatorio,
      false
    ])
    
    const createdRecordatorio = insertResult.rows[0]
    console.log(`✅ Recordatorio creado:`, createdRecordatorio)
    
    // 4. Verificar que se puede obtener
    console.log('4️⃣ Verificando que se puede obtener el recordatorio...')
    const getResult = await client.query(`
      SELECT 
        id,
        deposito_id as "depositoId",
        titulo,
        descripcion,
        tipo,
        prioridad,
        fecha_recordatorio as "fechaRecordatorio",
        completado,
        created_at as "createdAt",
        updated_at as "updatedAt"
      FROM DepositoRecordatorios 
      WHERE id = $1
    `, [createdRecordatorio.id])
    
    if (getResult.rows.length === 0) {
      client.release()
      return NextResponse.json({ 
        error: 'No se pudo obtener el recordatorio creado',
        step: 'get_check'
      }, { status: 500 })
    }
    
    console.log(`✅ Recordatorio obtenido:`, getResult.rows[0])
    
    // 5. Actualizar el recordatorio
    console.log('5️⃣ Actualizando recordatorio...')
    const updateResult = await client.query(`
      UPDATE DepositoRecordatorios 
      SET titulo = $1, completado = $2, updated_at = NOW()
      WHERE id = $3
      RETURNING 
        id,
        deposito_id as "depositoId",
        titulo,
        descripcion,
        tipo,
        prioridad,
        fecha_recordatorio as "fechaRecordatorio",
        completado,
        created_at as "createdAt",
        updated_at as "updatedAt"
    `, ['Test QA Recordatorio - ACTUALIZADO', true, createdRecordatorio.id])
    
    console.log(`✅ Recordatorio actualizado:`, updateResult.rows[0])
    
    // 6. Eliminar el recordatorio de prueba
    console.log('6️⃣ Eliminando recordatorio de prueba...')
    const deleteResult = await client.query(`
      DELETE FROM DepositoRecordatorios 
      WHERE id = $1
      RETURNING id
    `, [createdRecordatorio.id])
    
    if (deleteResult.rows.length === 0) {
      client.release()
      return NextResponse.json({ 
        error: 'No se pudo eliminar el recordatorio',
        step: 'delete_check'
      }, { status: 500 })
    }
    
    console.log(`✅ Recordatorio eliminado`)
    
    client.release()
    
    return NextResponse.json({
      success: true,
      message: 'Test de recordatorios completado exitosamente',
      steps: [
        '✅ Tabla DepositoRecordatorios existe',
        '✅ Depósito encontrado',
        '✅ Recordatorio creado',
        '✅ Recordatorio obtenido',
        '✅ Recordatorio actualizado',
        '✅ Recordatorio eliminado'
      ],
      depositoId: depositoId,
      testRecordatorio: createdRecordatorio
    })
    
  } catch (error) {
    console.error('❌ [QA DEPOSITO RECORDATORIOS] Error en test:', error)
    return NextResponse.json({ 
      error: 'Error en test de recordatorios',
      details: error.message,
      step: 'test_error'
    }, { status: 500 })
  }
}

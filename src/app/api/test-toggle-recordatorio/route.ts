import { NextResponse } from 'next/server'
import { pool } from '@/lib/direct-database'

export async function GET() {
  try {
    console.log('🧪 [QA TOGGLE RECORDATORIO] Iniciando test de toggle completado')
    
    const client = await pool.connect()
    
    // 1. Obtener un depósito existente
    console.log('1️⃣ Obteniendo depósito existente...')
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
    
    // 2. Crear un recordatorio de prueba
    console.log('2️⃣ Creando recordatorio de prueba...')
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
      'Test QA Toggle Recordatorio',
      'Recordatorio para probar toggle completado',
      'general',
      'media',
      new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
      false
    ])
    
    const recordatorio = insertResult.rows[0]
    console.log(`✅ Recordatorio creado:`, recordatorio)
    
    // 3. Verificar estado inicial (completado = false)
    console.log('3️⃣ Verificando estado inicial...')
    if (recordatorio.completado !== false) {
      client.release()
      return NextResponse.json({ 
        error: 'Estado inicial incorrecto',
        step: 'initial_state_check'
      }, { status: 500 })
    }
    console.log(`✅ Estado inicial correcto: completado = false`)
    
    // 4. Simular toggle a completado = true
    console.log('4️⃣ Simulando toggle a completado = true...')
    const updateResult = await client.query(`
      UPDATE DepositoRecordatorios 
      SET titulo = $1, 
          descripcion = $2, 
          tipo = $3, 
          prioridad = $4, 
          fecha_recordatorio = $5, 
          completado = $6,
          updated_at = NOW()
      WHERE id = $7 AND deposito_id = $8
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
      recordatorio.titulo,
      recordatorio.descripcion,
      recordatorio.tipo,
      recordatorio.prioridad,
      recordatorio.fechaRecordatorio,
      true, // Toggle a completado
      recordatorio.id,
      depositoId
    ])
    
    if (updateResult.rows.length === 0) {
      client.release()
      return NextResponse.json({ 
        error: 'No se pudo actualizar el recordatorio',
        step: 'update_check'
      }, { status: 500 })
    }
    
    const updatedRecordatorio = updateResult.rows[0]
    console.log(`✅ Recordatorio actualizado:`, updatedRecordatorio)
    
    // 5. Verificar que completado = true
    console.log('5️⃣ Verificando que completado = true...')
    if (updatedRecordatorio.completado !== true) {
      client.release()
      return NextResponse.json({ 
        error: 'Toggle a completado no funcionó',
        step: 'toggle_check'
      }, { status: 500 })
    }
    console.log(`✅ Toggle a completado funcionó correctamente`)
    
    // 6. Simular toggle de vuelta a completado = false
    console.log('6️⃣ Simulando toggle de vuelta a completado = false...')
    const toggleBackResult = await client.query(`
      UPDATE DepositoRecordatorios 
      SET titulo = $1, 
          descripcion = $2, 
          tipo = $3, 
          prioridad = $4, 
          fecha_recordatorio = $5, 
          completado = $6,
          updated_at = NOW()
      WHERE id = $7 AND deposito_id = $8
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
      recordatorio.titulo,
      recordatorio.descripcion,
      recordatorio.tipo,
      recordatorio.prioridad,
      recordatorio.fechaRecordatorio,
      false, // Toggle de vuelta a pendiente
      recordatorio.id,
      depositoId
    ])
    
    const finalRecordatorio = toggleBackResult.rows[0]
    console.log(`✅ Recordatorio toggle de vuelta:`, finalRecordatorio)
    
    // 7. Verificar que completado = false
    console.log('7️⃣ Verificando que completado = false...')
    if (finalRecordatorio.completado !== false) {
      client.release()
      return NextResponse.json({ 
        error: 'Toggle de vuelta no funcionó',
        step: 'toggle_back_check'
      }, { status: 500 })
    }
    console.log(`✅ Toggle de vuelta funcionó correctamente`)
    
    // 8. Limpiar - eliminar el recordatorio de prueba
    console.log('8️⃣ Limpiando recordatorio de prueba...')
    await client.query(`
      DELETE FROM DepositoRecordatorios 
      WHERE id = $1
    `, [recordatorio.id])
    
    console.log(`✅ Recordatorio de prueba eliminado`)
    
    client.release()
    
    return NextResponse.json({
      success: true,
      message: 'Test de toggle completado exitoso',
      steps: [
        '✅ Depósito encontrado',
        '✅ Recordatorio creado',
        '✅ Estado inicial correcto (completado = false)',
        '✅ Toggle a completado = true',
        '✅ Toggle de vuelta a completado = false',
        '✅ Recordatorio de prueba eliminado'
      ],
      depositoId: depositoId,
      recordatorioId: recordatorio.id
    })
    
  } catch (error) {
    console.error('❌ [QA TOGGLE RECORDATORIO] Error en test:', error)
    return NextResponse.json({ 
      error: 'Error en test de toggle',
      details: error.message,
      step: 'test_error'
    }, { status: 500 })
  }
}

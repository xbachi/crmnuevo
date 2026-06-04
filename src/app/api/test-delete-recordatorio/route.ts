import { NextResponse } from 'next/server'
import { pool } from '@/lib/direct-database'

export async function GET() {
  try {
    console.log('🧪 [QA DELETE RECORDATORIO] Iniciando test de eliminación')
    
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
      RETURNING id
    `, [
      depositoId,
      'Test QA Delete Recordatorio',
      'Recordatorio para probar eliminación',
      'llamada',
      'alta',
      new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
      false
    ])
    
    const recordatorioId = insertResult.rows[0].id
    console.log(`✅ Recordatorio creado con ID: ${recordatorioId}`)
    
    // 3. Verificar que existe antes de eliminar
    console.log('3️⃣ Verificando que el recordatorio existe...')
    const checkResult = await client.query(`
      SELECT id FROM DepositoRecordatorios WHERE id = $1
    `, [recordatorioId])
    
    if (checkResult.rows.length === 0) {
      client.release()
      return NextResponse.json({ 
        error: 'No se pudo crear el recordatorio de prueba',
        step: 'create_check'
      }, { status: 500 })
    }
    
    console.log(`✅ Recordatorio existe antes de eliminar`)
    
    // 4. Eliminar el recordatorio
    console.log('4️⃣ Eliminando recordatorio...')
    const deleteResult = await client.query(`
      DELETE FROM DepositoRecordatorios 
      WHERE id = $1 AND deposito_id = $2
      RETURNING id
    `, [recordatorioId, depositoId])
    
    if (deleteResult.rows.length === 0) {
      client.release()
      return NextResponse.json({ 
        error: 'No se pudo eliminar el recordatorio',
        step: 'delete_check'
      }, { status: 500 })
    }
    
    console.log(`✅ Recordatorio eliminado exitosamente`)
    
    // 5. Verificar que ya no existe
    console.log('5️⃣ Verificando que el recordatorio ya no existe...')
    const verifyResult = await client.query(`
      SELECT id FROM DepositoRecordatorios WHERE id = $1
    `, [recordatorioId])
    
    if (verifyResult.rows.length > 0) {
      client.release()
      return NextResponse.json({ 
        error: 'El recordatorio no fue eliminado correctamente',
        step: 'verify_check'
      }, { status: 500 })
    }
    
    console.log(`✅ Recordatorio eliminado correctamente`)
    
    client.release()
    
    return NextResponse.json({
      success: true,
      message: 'Test de eliminación de recordatorio completado exitosamente',
      steps: [
        '✅ Depósito encontrado',
        '✅ Recordatorio creado',
        '✅ Recordatorio existe antes de eliminar',
        '✅ Recordatorio eliminado',
        '✅ Recordatorio ya no existe'
      ],
      depositoId: depositoId,
      recordatorioId: recordatorioId
    })
    
  } catch (error) {
    console.error('❌ [QA DELETE RECORDATORIO] Error en test:', error)
    return NextResponse.json({ 
      error: 'Error en test de eliminación',
      details: error instanceof Error ? error.message : 'Error desconocido',
      step: 'test_error'
    }, { status: 500 })
  }
}

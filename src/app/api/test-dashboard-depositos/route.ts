import { NextResponse } from 'next/server'
import { pool } from '@/lib/direct-database'

export async function GET() {
  try {
    console.log('🧪 [QA DASHBOARD DEPOSITOS] Verificando recordatorios de depósitos en dashboard')
    
    const client = await pool.connect()
    
    // 1. Verificar que la tabla DepositoRecordatorios existe
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
    
    // 3. Crear un recordatorio de prueba para depósito
    console.log('3️⃣ Creando recordatorio de prueba para depósito...')
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
      'Test QA Dashboard Depósito',
      'Recordatorio para probar dashboard',
      'general',
      'alta',
      new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
      false
    ])
    
    const recordatorio = insertResult.rows[0]
    console.log(`✅ Recordatorio de depósito creado:`, recordatorio)
    
    // 4. Probar la API del dashboard
    console.log('4️⃣ Probando API del dashboard...')
    const dashboardResponse = await fetch('http://localhost:3000/api/dashboard/recordatorios')
    
    if (!dashboardResponse.ok) {
      client.release()
      return NextResponse.json({ 
        error: 'Error en API del dashboard',
        step: 'dashboard_api_check',
        status: dashboardResponse.status
      }, { status: 500 })
    }
    
    const dashboardData = await dashboardResponse.json()
    console.log(`✅ API del dashboard respondió:`, dashboardData.length, 'recordatorios')
    
    // 5. Buscar nuestro recordatorio de depósito en la respuesta
    console.log('5️⃣ Buscando recordatorio de depósito en respuesta...')
    const depositoRecordatorios = dashboardData.filter((r: any) => r.tipo_entidad === 'deposito')
    console.log(`📊 Recordatorios de depósito encontrados:`, depositoRecordatorios.length)
    
    const nuestroRecordatorio = depositoRecordatorios.find((r: any) => r.id === recordatorio.id)
    
    if (!nuestroRecordatorio) {
      client.release()
      return NextResponse.json({ 
        error: 'Recordatorio de depósito no encontrado en dashboard',
        step: 'recordatorio_not_found',
        dashboardData: dashboardData,
        depositoRecordatorios: depositoRecordatorios
      }, { status: 500 })
    }
    
    console.log(`✅ Recordatorio de depósito encontrado en dashboard:`, nuestroRecordatorio)
    
    // 6. Limpiar - eliminar el recordatorio de prueba
    console.log('6️⃣ Limpiando recordatorio de prueba...')
    await client.query(`
      DELETE FROM DepositoRecordatorios 
      WHERE id = $1
    `, [recordatorio.id])
    
    console.log(`✅ Recordatorio de prueba eliminado`)
    
    client.release()
    
    return NextResponse.json({
      success: true,
      message: 'Test de dashboard depósitos exitoso',
      steps: [
        '✅ Tabla DepositoRecordatorios existe',
        '✅ Depósito encontrado',
        '✅ Recordatorio de depósito creado',
        '✅ API del dashboard responde',
        '✅ Recordatorio de depósito encontrado en dashboard',
        '✅ Recordatorio de prueba eliminado'
      ],
      depositoId: depositoId,
      recordatorioId: recordatorio.id,
      totalRecordatorios: dashboardData.length,
      depositoRecordatorios: depositoRecordatorios.length
    })
    
  } catch (error) {
    console.error('❌ [QA DASHBOARD DEPOSITOS] Error en test:', error)
    return NextResponse.json({ 
      error: 'Error en test de dashboard depósitos',
      details: error.message,
      step: 'test_error'
    }, { status: 500 })
  }
}

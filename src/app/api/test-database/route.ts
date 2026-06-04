import { NextRequest, NextResponse } from 'next/server'
import { pool } from '@/lib/direct-database'

export async function GET(request: NextRequest) {
  try {
    console.log('🔍 [TEST DB] Iniciando test de base de datos...')

    // Test 1: Verificar variables de entorno
    const envInfo = {
      databaseUrl: process.env.DATABASE_URL ? 'Configurada' : 'No configurada',
      nodeEnv: process.env.NODE_ENV,
      vercel: !!process.env.VERCEL,
    }

    console.log('🔍 [TEST DB] Variables de entorno:', envInfo)

    // Test 2: Verificar conexión al pool
    let poolInfo = null
    try {
      poolInfo = {
        totalCount: pool.totalCount,
        idleCount: pool.idleCount,
        waitingCount: pool.waitingCount,
      }
      console.log('✅ [TEST DB] Pool info:', poolInfo)
    } catch (poolError) {
      poolInfo = {
        error: (poolError as Error).message,
      }
      console.error('❌ [TEST DB] Error en pool:', poolError)
    }

    // Test 3: Verificar conexión a la base de datos
    let connectionInfo = null
    let client = null
    try {
      client = await pool.connect()
      const conn = client as unknown as {
        processID?: number
        secretKey?: number
      }
      connectionInfo = {
        connected: true,
        processId: conn.processID,
        secretKey: conn.secretKey,
      }
      console.log('✅ [TEST DB] Conexión exitosa:', connectionInfo)
    } catch (connectionError) {
      connectionInfo = {
        connected: false,
        error: (connectionError as Error).message,
      }
      console.error('❌ [TEST DB] Error de conexión:', connectionError)
    }

    // Test 4: Verificar tabla Cliente
    let tableInfo = null
    if (client) {
      try {
        const result = await client.query(`
          SELECT column_name, data_type, is_nullable 
          FROM information_schema.columns 
          WHERE table_name = 'Cliente' 
          ORDER BY ordinal_position
        `)

        tableInfo = {
          exists: true,
          columns: result.rows.map((row) => ({
            name: row.column_name,
            type: row.data_type,
            nullable: row.is_nullable === 'YES',
          })),
        }
        console.log('✅ [TEST DB] Tabla Cliente:', tableInfo)
      } catch (tableError) {
        tableInfo = {
          exists: false,
          error: (tableError as Error).message,
        }
        console.error('❌ [TEST DB] Error verificando tabla:', tableError)
      }
    }

    // Test 5: Verificar inserción simple
    let insertTest = null
    if (client && tableInfo?.exists) {
      try {
        const testResult = await client.query(`
          INSERT INTO "Cliente" (
            nombre, apellidos, telefono, email, estado, prioridad, activo,
            "createdAt", "updatedAt"
          ) VALUES (
            'Test', 'Test', '123456789', 'test@test.com', 'nuevo', 'media', true,
            NOW(), NOW()
          ) RETURNING id
        `)

        const testId = testResult.rows[0].id

        // Limpiar el registro de prueba
        await client.query('DELETE FROM "Cliente" WHERE id = $1', [testId])

        insertTest = {
          success: true,
          testId: testId,
        }
        console.log('✅ [TEST DB] Inserción de prueba exitosa:', insertTest)
      } catch (insertError) {
        insertTest = {
          success: false,
          error: (insertError as Error).message,
        }
        console.error('❌ [TEST DB] Error en inserción de prueba:', insertError)
      }
    }

    // Liberar conexión
    if (client) {
      client.release()
    }

    const result = {
      success: true,
      timestamp: new Date().toISOString(),
      environment: envInfo,
      pool: poolInfo,
      connection: connectionInfo,
      table: tableInfo,
      insertTest: insertTest,
    }

    console.log('✅ [TEST DB] Test completado:', result)

    return NextResponse.json(result)
  } catch (error) {
    console.error('❌ [TEST DB] Error en test:', error)
    return NextResponse.json(
      {
        success: false,
        error: (error as Error).message,
        stack: (error as Error).stack,
      },
      { status: 500 }
    )
  }
}

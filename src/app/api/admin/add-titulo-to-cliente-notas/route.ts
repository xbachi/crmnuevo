import { NextResponse } from 'next/server'
import { pool } from '@/lib/direct-database'

export async function POST() {
  try {
    console.log('🔧 Agregando columna titulo a NotaCliente...')

    const client = await pool.connect()

    // Agregar columna titulo si no existe
    await client.query(`
      ALTER TABLE "NotaCliente" 
      ADD COLUMN IF NOT EXISTS titulo VARCHAR(255) DEFAULT 'Nota general'
    `)

    // Agregar columna prioridad si no existe
    await client.query(`
      ALTER TABLE "NotaCliente" 
      ADD COLUMN IF NOT EXISTS prioridad VARCHAR(20) DEFAULT 'normal'
    `)

    // Agregar columna usuario si no existe
    await client.query(`
      ALTER TABLE "NotaCliente" 
      ADD COLUMN IF NOT EXISTS usuario VARCHAR(100) DEFAULT 'Sistema'
    `)

    // Agregar columna fecha si no existe
    await client.query(`
      ALTER TABLE "NotaCliente" 
      ADD COLUMN IF NOT EXISTS fecha TIMESTAMP DEFAULT NOW()
    `)

    // Agregar columna createdAt si no existe
    await client.query(`
      ALTER TABLE "NotaCliente" 
      ADD COLUMN IF NOT EXISTS "createdAt" TIMESTAMP DEFAULT NOW()
    `)

    // Agregar columna updatedAt si no existe
    await client.query(`
      ALTER TABLE "NotaCliente" 
      ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMP DEFAULT NOW()
    `)

    client.release()

    console.log('✅ Columnas agregadas exitosamente a NotaCliente')
    return NextResponse.json({
      message: 'Columnas agregadas correctamente a NotaCliente',
      addedColumns: [
        'titulo VARCHAR(255) DEFAULT Nota general',
        'prioridad VARCHAR(20) DEFAULT normal',
        'usuario VARCHAR(100) DEFAULT Sistema',
        'fecha TIMESTAMP DEFAULT NOW()',
        'createdAt TIMESTAMP DEFAULT NOW()',
        'updatedAt TIMESTAMP DEFAULT NOW()',
      ],
    })
  } catch (error) {
    console.error('❌ Error agregando columnas a NotaCliente:', error)
    return NextResponse.json(
      {
        error: 'Error interno del servidor',
        details: error instanceof Error ? error.message : 'Error desconocido',
        code:
          error instanceof Error && 'code' in error ? error.code : 'UNKNOWN',
      },
      { status: 500 }
    )
  }
}

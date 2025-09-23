import { NextResponse } from 'next/server'
import { pool } from '@/lib/direct-database'

export async function POST() {
  try {
    console.log('🔧 Creando tabla NotaCliente...')

    const client = await pool.connect()

    // Crear tabla NotaCliente con la misma estructura que NotaDeposito
    await client.query(`
      CREATE TABLE IF NOT EXISTS "NotaCliente" (
        id SERIAL PRIMARY KEY,
        "clienteId" INTEGER NOT NULL,
        tipo VARCHAR(50) DEFAULT 'general',
        titulo VARCHAR(255) DEFAULT 'Nota general',
        contenido TEXT NOT NULL,
        prioridad VARCHAR(20) DEFAULT 'normal',
        usuario VARCHAR(100) DEFAULT 'Sistema',
        fecha TIMESTAMP DEFAULT NOW(),
        "createdAt" TIMESTAMP DEFAULT NOW(),
        "updatedAt" TIMESTAMP DEFAULT NOW(),
        FOREIGN KEY ("clienteId") REFERENCES "Cliente"(id) ON DELETE CASCADE
      )
    `)

    // Crear índices para mejor rendimiento
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_nota_cliente_cliente_id ON "NotaCliente"("clienteId")
    `)

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_nota_cliente_fecha ON "NotaCliente"(fecha)
    `)

    client.release()

    console.log('✅ Tabla NotaCliente creada exitosamente')
    return NextResponse.json({
      message: 'Tabla NotaCliente creada correctamente',
      structure: {
        id: 'SERIAL PRIMARY KEY',
        clienteId: 'INTEGER NOT NULL (FK to Cliente)',
        tipo: 'VARCHAR(50) DEFAULT general',
        titulo: 'VARCHAR(255) DEFAULT Nota general',
        contenido: 'TEXT NOT NULL',
        prioridad: 'VARCHAR(20) DEFAULT normal',
        usuario: 'VARCHAR(100) DEFAULT Sistema',
        fecha: 'TIMESTAMP DEFAULT NOW()',
        createdAt: 'TIMESTAMP DEFAULT NOW()',
        updatedAt: 'TIMESTAMP DEFAULT NOW()',
      },
    })
  } catch (error) {
    console.error('❌ Error creando tabla NotaCliente:', error)
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

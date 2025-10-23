import { NextRequest, NextResponse } from 'next/server'
import { pool } from '@/lib/direct-database'

export async function GET() {
  try {
    console.log('🔍 [API CLIENTES] Obteniendo lista de clientes...')

    const client = await pool.connect()
    try {
      const result = await client.query(
        `SELECT * FROM "Cliente" ORDER BY "createdAt" DESC`
      )

      console.log(
        `✅ [API CLIENTES] ${result.rows.length} clientes encontrados`
      )
      return NextResponse.json(result.rows)
    } finally {
      client.release()
    }
  } catch (error) {
    console.error('❌ [API CLIENTES] Error al obtener clientes:', error)
    return NextResponse.json(
      { error: 'Error al cargar clientes' },
      { status: 500 }
    )
  }
}

export async function POST(request: NextRequest) {
  try {
    console.log('🔍 [API CLIENTES] Iniciando creación de cliente...')

    const data = await request.json()
    console.log('🔍 [API CLIENTES] Datos recibidos:', {
      nombre: data.nombre,
      apellidos: data.apellidos,
      telefono: data.telefono,
      email: data.email,
    })

    // Validaciones básicas
    if (!data.nombre || data.nombre.trim() === '') {
      console.log('❌ [API CLIENTES] Error: Nombre faltante')
      return NextResponse.json(
        { error: 'El nombre es obligatorio' },
        { status: 400 }
      )
    }

    if (!data.apellidos || data.apellidos.trim() === '') {
      console.log('❌ [API CLIENTES] Error: Apellidos faltantes')
      return NextResponse.json(
        { error: 'Los apellidos son obligatorios' },
        { status: 400 }
      )
    }

    if (!data.telefono || data.telefono.trim() === '') {
      console.log('❌ [API CLIENTES] Error: Teléfono faltante')
      return NextResponse.json(
        { error: 'El teléfono es obligatorio' },
        { status: 400 }
      )
    }

    // Crear cliente directamente con SQL simplificado
    const client = await pool.connect()
    try {
      console.log('🔍 [API CLIENTES] Conectando a la base de datos...')

      const result = await client.query(
        `
        INSERT INTO "Cliente" (
          nombre, apellidos, telefono, email, estado, prioridad, activo,
          "createdAt", "updatedAt"
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7, NOW(), NOW()
        ) RETURNING *
      `,
        [
          data.nombre.trim(),
          data.apellidos.trim(),
          data.telefono.trim(),
          data.email?.trim() || null,
          data.estado || 'nuevo',
          data.prioridad || 'media',
          data.activo !== false, // true por defecto
        ]
      )

      const cliente = result.rows[0]
      console.log('✅ [API CLIENTES] Cliente creado exitosamente:', cliente.id)

      return NextResponse.json(cliente, { status: 201 })
    } finally {
      client.release()
    }
  } catch (error) {
    console.error('❌ [API CLIENTES] Error al crear cliente:', error)
    console.error('❌ [API CLIENTES] Tipo de error:', typeof error)
    console.error('❌ [API CLIENTES] Mensaje:', (error as Error).message)
    console.error('❌ [API CLIENTES] Stack:', (error as Error).stack)
    return NextResponse.json(
      {
        error: 'Error interno del servidor',
        details: (error as Error).message,
        timestamp: new Date().toISOString(),
      },
      { status: 500 }
    )
  }
}

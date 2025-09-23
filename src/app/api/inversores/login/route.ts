import { NextRequest, NextResponse } from 'next/server'
import { pool } from '@/lib/direct-database'

export async function POST(request: NextRequest) {
  try {
    const { usuario, contraseña } = await request.json()

    if (!usuario || !contraseña) {
      return NextResponse.json(
        { error: 'Usuario y contraseña son obligatorios' },
        { status: 400 }
      )
    }

    const client = await pool.connect()
    try {
      const result = await client.query(
        'SELECT id, nombre, email, usuario FROM "Inversor" WHERE usuario = $1 AND contraseña = $2',
        [usuario, contraseña]
      )

      if (result.rows.length === 0) {
        return NextResponse.json(
          { error: 'Credenciales inválidas' },
          { status: 401 }
        )
      }

      const inversor = result.rows[0]

      // No devolver la contraseña en la respuesta
      return NextResponse.json({
        id: inversor.id,
        nombre: inversor.nombre,
        email: inversor.email,
        usuario: inversor.usuario,
      })
    } finally {
      client.release()
    }
  } catch (error) {
    console.error('Error en login de inversor:', error)
    return NextResponse.json(
      { error: 'Error interno del servidor' },
      { status: 500 }
    )
  }
}

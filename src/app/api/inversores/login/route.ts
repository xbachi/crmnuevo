import { NextRequest, NextResponse } from 'next/server'
import { pool } from '@/lib/direct-database'
import { createSessionToken } from '@/lib/auth-server'
import { INVERSOR_COOKIE } from '@/lib/auth-edge'

const INVERSOR_SESSION_TTL = 60 * 60 * 24 * 30 // 30 días

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

      // Sesión propia del inversor (cookie httpOnly): el middleware le permite
      // SOLO GET sobre /api/inversores/{su id}/**. Sin esto, la página del
      // inversor recibía 401 en todos los fetch.
      const token = createSessionToken(inversor.id, 'inversor')
      const res = NextResponse.json({
        id: inversor.id,
        nombre: inversor.nombre,
        email: inversor.email,
        usuario: inversor.usuario,
      })
      res.cookies.set(INVERSOR_COOKIE, token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        path: '/',
        maxAge: INVERSOR_SESSION_TTL,
      })
      return res
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

import { NextRequest, NextResponse } from 'next/server'
import { readSessionFromRequest, findUserById } from '@/lib/auth-server'

/**
 * GET /api/auth/me
 * Devuelve el usuario de la sesión actual o 401 si no hay/expiró.
 */
export async function GET(request: NextRequest) {
  const session = readSessionFromRequest(request)
  if (!session) {
    return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
  }
  const user = await findUserById(session.uid)
  if (!user) {
    return NextResponse.json({ error: 'Usuario no encontrado' }, { status: 401 })
  }
  return NextResponse.json({
    user: {
      id: user.id,
      email: user.email,
      role: user.role,
      name: user.display_name,
    },
  })
}

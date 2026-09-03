import { NextRequest, NextResponse } from 'next/server'
import {
  findUserByEmail,
  verifyPassword,
  createSessionToken,
  recordLogin,
  SESSION_COOKIE,
} from '@/lib/auth-server'
import {
  claveLogin,
  estaBloqueado,
  limpiar,
  registrarFallo,
} from '@/lib/loginRateLimit'

/**
 * POST /api/auth/login
 * Body: { email, password }
 * Devuelve { user: { id, email, role, name } } y setea cookie HttpOnly.
 * Rate limit: 5 fallos por ip+email en 15 minutos → 429.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}))
    const email = (body.email ?? '').toString().trim()
    const password = (body.password ?? '').toString()

    if (!email || !password) {
      return NextResponse.json(
        { error: 'Email y contraseña obligatorios' },
        { status: 400 }
      )
    }

    // Limitación conocida: el limitador vive en memoria, por instancia serverless.
    const ip =
      request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown'
    const clave = claveLogin(ip, email)
    if (estaBloqueado(clave)) {
      return NextResponse.json(
        { error: 'Demasiados intentos. Esperá 15 minutos.' },
        { status: 429 }
      )
    }

    const user = await findUserByEmail(email)
    // Always do the verify even if user is null to mitigate timing attacks.
    const ok = user
      ? verifyPassword(password, user.password_hash)
      : (verifyPassword(password, 'scrypt:00:00'), false)

    if (!user || !ok) {
      registrarFallo(clave)
      return NextResponse.json(
        { error: 'Credenciales inválidas' },
        { status: 401 }
      )
    }

    limpiar(clave)
    recordLogin(user.id).catch((e) => console.warn('[login] recordLogin:', e))

    const token = createSessionToken(user.id, user.role)
    const res = NextResponse.json({
      user: {
        id: user.id,
        email: user.email,
        role: user.role,
        name: user.display_name,
      },
    })
    res.cookies.set(SESSION_COOKIE, token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: 60 * 60 * 24 * 30, // 30 días, igual al TTL del token
    })
    return res
  } catch (err) {
    console.error('[POST /api/auth/login]', err)
    return NextResponse.json({ error: 'Error interno' }, { status: 500 })
  }
}

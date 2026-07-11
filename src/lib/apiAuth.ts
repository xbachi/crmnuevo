import { NextResponse } from 'next/server'
import { readSessionFromRequest, type SessionPayload } from '@/lib/auth-server'

type Authenticated = { session: SessionPayload; response?: never }
type Rejected = { session?: never; response: NextResponse }

export function requireApiSession(
  request: Parameters<typeof readSessionFromRequest>[0]
): Authenticated | Rejected {
  const session = readSessionFromRequest(request)
  if (!session) {
    return {
      response: NextResponse.json(
        { error: 'No autenticado', code: 'UNAUTHENTICATED' },
        { status: 401 }
      ),
    }
  }
  return { session }
}

export function requireAdminSession(
  request: Parameters<typeof readSessionFromRequest>[0]
): Authenticated | Rejected {
  const auth = requireApiSession(request)
  if (auth.response) return auth
  if (auth.session.role !== 'admin') {
    return {
      response: NextResponse.json(
        { error: 'Permisos insuficientes', code: 'FORBIDDEN' },
        { status: 403 }
      ),
    }
  }
  return auth
}

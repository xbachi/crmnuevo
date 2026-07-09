import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { SESSION_COOKIE, verifySessionTokenEdge } from '@/lib/auth-edge'

/**
 * Whitelist de rutas API que NO requieren autenticación.
 * - /api/auth/* → login/logout/me (sin sesión por definición)
 * - /api/test-* → bloqueadas en prod, libres en dev
 */
const PUBLIC_API_PREFIXES = [
  '/api/auth/login',
  '/api/auth/logout',
  '/api/auth/me',
  // El receptor de n8n reporta acá con X-Webhook-Secret (sin sesión). El GET
  // valida la sesión dentro del handler.
  '/api/automation-log',
  // n8n carga importes de facturas de proveedor (X-Webhook-Secret).
  '/api/vehiculos/gasto',
  // n8n registra facturas en el registro unificado (X-Webhook-Secret).
  '/api/gestoria/factura',
  // Revisión del registro para entrega a gestoría (X-Admin-Secret).
  '/api/gestoria/audit',
  // Endpoints admin de monitoreo y reparación (X-Admin-Secret).
  '/api/admin/check-costobeneficio',
  '/api/admin/check-facturas',
  '/api/admin/repair-costobeneficio',
  '/api/admin/resync-costobeneficio',
  // Cron de Vercel (self-auth por CRON_SECRET / X-Admin-Secret).
  '/api/cron/costobeneficio',
]

export async function middleware(request: NextRequest) {
  const path = request.nextUrl.pathname

  // Bloquear endpoints /api/test-* en producción.
  if (path.startsWith('/api/test-')) {
    if (process.env.NODE_ENV === 'production') {
      return new NextResponse(null, { status: 404 })
    }
    return NextResponse.next()
  }

  // Whitelist de auth.
  if (PUBLIC_API_PREFIXES.some((p) => path === p || path.startsWith(p + '/'))) {
    return NextResponse.next()
  }

  // Cualquier otra ruta /api/** requiere sesión válida.
  const token = request.cookies.get(SESSION_COOKIE)?.value
  const session = await verifySessionTokenEdge(token)
  if (!session) {
    return NextResponse.json(
      { error: 'No autenticado', code: 'UNAUTHENTICATED' },
      { status: 401 }
    )
  }

  // Sesión válida — passthrough. (Si necesitás role-based en endpoints
  // específicos, lo chequeás dentro del handler con readSessionFromRequest.)
  return NextResponse.next()
}

export const config = {
  matcher: '/api/:path*',
}

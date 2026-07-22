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
  // El enriquecedor del server pide las facturas sin datos fiscales (X-Webhook-Secret).
  '/api/gestoria/pendientes-fiscal',
  // Revisión del registro para entrega a gestoría (X-Admin-Secret).
  '/api/gestoria/audit',
  // Snapshot del inventario de carpetas de expedientes en OneDrive; lo POSTea
  // el script del server (X-Webhook-Secret).
  '/api/gestoria/expedientes-snapshot',
  // Chequeo integral de expedientes: X-Admin-Secret O sesión, validado en el
  // handler (mismo patrón que /api/automation-log).
  '/api/gestoria/chequeo-expedientes',
  // Manifiesto de entrega y libro IVA/REBU del trimestre (X-Admin-Secret).
  '/api/gestoria/manifiesto',
  '/api/gestoria/libro',
  // Endpoints admin de monitoreo y reparación (X-Admin-Secret).
  '/api/admin/check-costobeneficio',
  '/api/admin/check-facturas',
  '/api/admin/repair-costobeneficio',
  '/api/admin/resync-costobeneficio',
  '/api/admin/anomalias-costos',
  // Reparación del doble conteo baseline SHEET2026 + facturas reales (X-Admin-Secret).
  '/api/admin/repair-gastos-dup',
  // Verificación de la cadena de integridad de facturación (X-Admin-Secret).
  '/api/admin/verifactu',
  // Rectificativa por secreto de admin (la UI usa /api/invoices/[id]/rectificar
  // con sesión; este camino es para operaciones puntuales por script).
  '/api/admin/rectificar-factura',
  // Reparación del PDF de rectificativas en PDF_PENDING (X-Admin-Secret).
  '/api/admin/rectificativas-pdf',
  // Conversión de régimen (VAT↔REBU) en el lugar, sin rectificativa (X-Admin-Secret).
  '/api/admin/convertir-regimen',
  // Stock aging / recon tracking (X-Admin-Secret).
  '/api/admin/stock-aging',
  // Reconciliación pre-cierre de trimestre y reintento de outbox (X-Admin-Secret).
  '/api/admin/pre-cierre',
  // Cierre mensual: listar/cerrar/reabrir períodos contables (X-Admin-Secret).
  '/api/admin/periodos',
  // Recalcular expedientes contra evidencia (X-Admin-Secret). Solo este
  // sub-path: /api/expedientes y /api/expedientes/[id] siguen con sesión.
  '/api/expedientes/recalcular',
  '/api/admin/webhook-outbox/retry',
  // Cron de Vercel (self-auth por CRON_SECRET / X-Admin-Secret).
  '/api/cron/costobeneficio',
  // Bandeja de revisión: POST lo llama n8n (X-Webhook-Secret) y /sync es
  // admin (X-Admin-Secret). GET y /[id]/resolver validan sesión en el handler
  // (mismo patrón que /api/automation-log).
  '/api/revision',
  // Webhook de firma digital (Signaturit). Valida SIGNATURIT_WEBHOOK_SECRET
  // dentro del handler si está seteado.
  '/api/firma/webhook',
  // Scan de duplicados difusos del registro fiscal: X-Admin-Secret O sesión
  // admin, validado en el handler (patrón /api/gestoria/chequeo-expedientes).
  // SOLO este sub-path: el resto de /api/fiscal/* va por sesión y NO se whitelistea.
  '/api/fiscal/duplicados/scan',
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

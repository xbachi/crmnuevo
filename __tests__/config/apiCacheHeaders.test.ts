/**
 * Regresión: /api/* servía `Cache-Control: public, max-age=60, s-maxage=60`.
 * Tras emitir una factura, la ficha de la venta re-leía /api/invoices y
 * /api/deals/[id] desde la caché del navegador/CDN y seguía mostrando
 * "Emitir IVA / Emitir REBU" durante minutos. La API es autenticada y
 * mutable: nunca debe cachearse.
 */
import nextConfig from '../../next.config'

describe('next.config headers()', () => {
  it('/api/* no se cachea en navegador ni CDN', async () => {
    const rules = await nextConfig.headers!()
    const api = rules.find((r) => r.source === '/api/:path*')
    expect(api).toBeDefined()
    const cc = api!.headers.find((h) => h.key === 'Cache-Control')
    expect(cc).toBeDefined()
    expect(cc!.value).toBe('private, no-store')
    expect(cc!.value).not.toMatch(/public|max-age=[1-9]/)
  })
})

import { test, expect, type Page } from '@playwright/test'

/**
 * Smoke: cada página principal carga con sesión (storageState del
 * global-setup), muestra su título real y no deja errores de consola.
 * Tagged @smoke. Los tiempos contemplan el dev server (compila bajo demanda).
 */

const PAGINAS = [
  { path: '/', h1: /Dashboard/ },
  { path: '/clientes', h1: /Clientes/ },
  { path: '/vehiculos', h1: /Vehículos/ },
  { path: '/deals', h1: /Ventas/ },
  { path: '/depositos', h1: /Depósitos/ },
  { path: '/inversores', h1: /Inversores/ },
  { path: '/kanban', h1: /Tablero/ },
  { path: '/presupuestos', h1: /Presupuestos/ },
]

const FORMULARIOS = [
  { path: '/clientes/crear', h1: /Crear Nuevo Cliente/ },
  { path: '/cargar-vehiculo', h1: /Cargar Vehículo/ },
  { path: '/deals/nuevo', h1: /Nuevo Deal/ },
  { path: '/depositos/nuevo', h1: /Nuevo Depósito/ },
]

/** Errores de consola que sí importan: excluye recursos 404 y fetches
 *  abortados por la propia navegación del test. */
function capturarErrores(page: Page): string[] {
  const errores: string[] = []
  page.on('console', (msg) => {
    if (msg.type() !== 'error') return
    const t = msg.text()
    if (/favicon|404|Failed to fetch|chrome-extension|AbortError/.test(t))
      return
    errores.push(t)
  })
  return errores
}

test.describe('Smoke Tests - Navigation @smoke', () => {
  test('la home carga con navegación y título', async ({ page }) => {
    const errores = capturarErrores(page)
    await page.goto('/')
    await expect(page).toHaveTitle(/CRM Seven Cars|CRM|Seven Cars/)
    await expect(page.locator('nav').first()).toBeVisible({ timeout: 60000 })
    await expect(page.locator('h1').first()).toHaveText(/Dashboard/)
    await page.waitForLoadState('load')
    expect(errores).toHaveLength(0)
  })

  for (const { path, h1 } of PAGINAS) {
    test(`${path} carga y muestra su título`, async ({ page }) => {
      const errores = capturarErrores(page)
      const res = await page.goto(path)
      expect(res?.status() ?? 200).toBeLessThan(400)
      await expect(page.locator('h1').first()).toHaveText(h1, {
        timeout: 30000,
      })
      await page.waitForLoadState('load')
      expect(errores).toHaveLength(0)
    })
  }

  for (const { path, h1 } of FORMULARIOS) {
    test(`${path} carga el formulario`, async ({ page }) => {
      const res = await page.goto(path)
      expect(res?.status()).toBe(200)
      await expect(page.locator('h1').first()).toHaveText(h1, {
        timeout: 30000,
      })
      await expect(
        page.locator('input, select, textarea').first()
      ).toBeVisible()
    })
  }

  test('los enlaces del menú llevan a cada sección', async ({ page }) => {
    await page.goto('/')
    await expect(page.locator('nav').first()).toBeVisible({ timeout: 30000 })
    for (const { path, h1 } of PAGINAS.slice(1, 5)) {
      await page.locator(`nav a[href="${path}"]:visible`).first().click()
      await expect(page).toHaveURL(new RegExp(`${path}(\\?|$)`), {
        timeout: 30000,
      })
      await expect(page.locator('h1').first()).toHaveText(h1, {
        timeout: 30000,
      })
    }
  })

  test('sin sesión redirige al login', async ({ browser }) => {
    const ctx = await browser.newContext({ storageState: undefined })
    const page = await ctx.newPage()
    // ProtectedRoute redirige cuando /api/auth/me responde sin sesión.
    const me = page.waitForResponse((r) => r.url().includes('/api/auth/me'), {
      timeout: 60000,
    })
    await page.goto('/clientes')
    expect((await me).status()).toBe(401)
    await expect(page).toHaveURL(/\/login/, { timeout: 60000 })
    await ctx.close()
  })

  test('una ruta inexistente devuelve 404', async ({ page }) => {
    const res = await page.goto('/non-existent-page')
    expect(res?.status()).toBe(404)
    await expect(page.locator('h1').first()).toHaveText(/404/, {
      timeout: 30000,
    })
  })

  test('el formulario de cliente valida campos obligatorios', async ({
    page,
  }) => {
    await page.goto('/clientes/crear')
    await expect(page.locator('h1').first()).toHaveText(/Crear Nuevo Cliente/, {
      timeout: 30000,
    })
    await page.locator('button[type="submit"]').first().click()
    // Sigue en el formulario: no se creó nada con los campos vacíos.
    await expect(page).toHaveURL(/\/clientes\/crear/)
  })

  test('la vista móvil muestra la página', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 })
    await page.goto('/')
    await expect(page.locator('h1').first()).toHaveText(/Dashboard/, {
      timeout: 30000,
    })
  })
})

test.describe('Performance Smoke Tests @smoke', () => {
  test('las páginas responden en un tiempo razonable', async ({ page }) => {
    // Dev server: la primera visita compila la ruta; se mide la segunda.
    // 'load' y no 'networkidle': el dashboard hace polling y nunca queda idle.
    for (const { path } of PAGINAS.slice(0, 5)) {
      await page.goto(path)
      await page.waitForLoadState('load')
      const t0 = Date.now()
      await page.goto(path)
      await page.waitForLoadState('load')
      expect(Date.now() - t0).toBeLessThan(15000)
    }
  })

  test('las APIs de la lista de clientes responden 2xx', async ({ page }) => {
    const respuestas: Array<{ url: string; status: number }> = []
    page.on('response', (r) => {
      if (r.url().includes('/api/')) {
        respuestas.push({ url: r.url(), status: r.status() })
      }
    })
    const lista = page.waitForResponse(
      (r) => r.url().includes('/api/clientes'),
      { timeout: 30000 }
    )
    await page.goto('/clientes')
    expect((await lista).status()).toBeLessThan(400)
    await page.waitForLoadState('load')
    for (const r of respuestas) {
      expect(r.status, r.url).toBeLessThan(400)
    }
  })
})

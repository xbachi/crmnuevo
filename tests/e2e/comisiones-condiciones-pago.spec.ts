import { test, expect, type Page } from '@playwright/test'

/**
 * E2E de la feature de comisiones + condiciones de pago.
 *
 * AUTENTICACIÓN: la app hidrata la sesión en cliente desde GET /api/auth/me
 * (AuthContext) y ProtectedRoute sólo mira ese resultado. No hay Postgres
 * local (el DATABASE_URL de .env.local apunta a la base gestionada), así que
 * NO se hace login real contra la DB: se interceptan las rutas /api/** con
 * page.route() y se sirve una sesión admin + fixtures. Así los tests son
 * herméticos, no tocan datos reales y —sobre todo— permiten CONTAR requests,
 * que es la única forma de detectar el bug de re-fetch en loop.
 */

const SESSION_USER = {
  user: { id: 1, email: 'qa@sevencars.test', role: 'admin', name: 'QA' },
}

function comisionesPayload(year: number, month: number) {
  return {
    year,
    month,
    config: {
      umbralFinanciado: 0.7,
      contado: { standard: 100, premium: 150 },
      financiadoBajo: { standard: 150, premium: 200 },
      financiadoAlto: { pctStandard: 0.4, pctPremium: 1 },
      bonos: [
        { minVentas: 8, importe: 300 },
        { minVentas: 12, importe: 600 },
      ],
    },
    configDisponible: true,
    condicionesDisponibles: true,
    ventas: [
      {
        invoiceId: 1000 + month,
        dealId: 1,
        numeroFactura: `V-${month}`,
        fecha: `${year}-${String(month).padStart(2, '0')}-10`,
        importe: 20000,
        precioVenta: 20000,
        matricula: '1234ABC',
        vehiculo: `Coche de mes ${month}`,
        condiciones: {
          formaPago: 'financiado',
          banco: 'Santander Consumer',
          interes: 7.5,
          cuotas: 60,
          montoFinanciado: 16000,
          montoContado: null,
          garantiaPremium: true,
        },
        comision: {
          tramo: 'financiadoAlto',
          ratioFinanciado: 0.8,
          pctAplicado: 1,
          total: 160,
          motivo: '80% financiado ≥ umbral 70%',
        },
        sinDatos: false,
      },
    ],
    totales: {
      ventasContadas: 1,
      sinDatos: 0,
      subtotalVentas: 160,
      escalonBono: null,
      importeBono: 0,
      siguienteEscalon: { minVentas: 8, importe: 300 },
      faltanParaSiguiente: 7,
      total: 160,
    },
  }
}

/** Sesión admin sin tocar la DB. */
async function mockAuth(page: Page) {
  await page.route(/\/api\/auth\/me$/, (route) =>
    route.fulfill({ json: SESSION_USER })
  )
}

test.describe('Comisiones @comisiones', () => {
  test('carga, ofrece los 12 meses y refetchea 1 sola vez por cambio de mes', async ({
    page,
  }) => {
    test.setTimeout(90_000)
    await mockAuth(page)

    // Contamos TODOS los GET a /api/comisiones para detectar el loop de
    // re-fetch (el bug histórico de /expedientes: useEffect dependiente de un
    // showToast no memoizado → fetch infinito, página parpadeando).
    const requests: string[] = []
    await page.route(/\/api\/comisiones\?/, async (route) => {
      const url = new URL(route.request().url())
      requests.push(url.search)
      const year = Number(url.searchParams.get('year'))
      const month = Number(url.searchParams.get('month'))
      await route.fulfill({ json: comisionesPayload(year, month) })
    })

    await page.goto('/comisiones')

    // exact: el panel de config (admin) tiene un h2 "Configuración de
    // comisiones" que también haría match por substring.
    // 60 s: en dev el primer hit compila la ruta (no es lentitud del producto).
    await expect(
      page.getByRole('heading', { name: 'Comisiones', exact: true })
    ).toBeVisible({ timeout: 60_000 })

    // Los 12 meses están disponibles como período seleccionable.
    const mesSelect = page.locator('select').first()
    await expect(mesSelect.locator('option')).toHaveCount(12)
    await expect(mesSelect.locator('option').first()).toHaveText('Enero')
    await expect(mesSelect.locator('option').last()).toHaveText('Diciembre')

    // La tabla renderizó: no quedó en "Cargando…".
    await expect(page.getByText('Cargando…')).toHaveCount(0)
    await expect(page.getByRole('cell', { name: /Coche de mes/ })).toBeVisible()

    // La carga inicial dispara 1 fetch (2 en dev: React StrictMode monta los
    // efectos dos veces). Lo que importa es que sea ACOTADO y que se estabilice.
    await page.waitForTimeout(3000)
    const trasCarga = requests.length
    expect(trasCarga).toBeGreaterThanOrEqual(1)
    expect(trasCarga).toBeLessThanOrEqual(2)

    // Detector del loop: en reposo el contador NO crece. Con el efecto mal
    // dependido (showToast no memoizado) acá habría decenas y subiendo.
    await page.waitForTimeout(3000)
    expect(requests.length).toBe(trasCarga)

    // Cambiar de mes refetchea EXACTAMENTE una vez, con el mes pedido.
    await mesSelect.selectOption('3')
    await expect(page.getByRole('cell', { name: 'Coche de mes 3' })).toBeVisible()
    await page.waitForTimeout(3000)
    expect(requests.length).toBe(trasCarga + 1)
    expect(requests[trasCarga]).toContain('month=3')

    // Segundo cambio: idem, sin arrastrar loops.
    await mesSelect.selectOption('11')
    await expect(
      page.getByRole('cell', { name: 'Coche de mes 11' })
    ).toBeVisible()
    await page.waitForTimeout(3000)
    expect(requests.length).toBe(trasCarga + 2)
    expect(requests[trasCarga + 1]).toContain('month=11')

    // La página sigue viva y con datos (no se quedó cargando).
    await expect(page.getByText('Cargando…')).toHaveCount(0)
  })

  test('muestra subtotal, bono y total al pie', async ({ page }) => {
    test.setTimeout(90_000)
    await mockAuth(page)
    await page.route(/\/api\/comisiones\?/, async (route) => {
      const url = new URL(route.request().url())
      await route.fulfill({
        json: comisionesPayload(
          Number(url.searchParams.get('year')),
          Number(url.searchParams.get('month'))
        ),
      })
    })

    await page.goto('/comisiones')
    // El pie vive en el tfoot; el panel de config (admin) repite algunos
    // textos, así que se busca por celda.
    await expect(page.getByRole('cell', { name: /Subtotal comisiones/ })).toBeVisible({
      timeout: 60_000,
    })
    await expect(page.getByRole('cell', { name: /Bono mensual/ })).toBeVisible()
    await expect(page.getByRole('cell', { name: 'Total del mes' })).toBeVisible()
    // Tramo aplicado visible y auditable en la fila.
    await expect(page.getByText(/Financiado ≥70%/)).toBeVisible()
  })
})

const DEAL = {
  id: 1,
  numero: 'D-1',
  clienteId: 1,
  vehiculoId: 1,
  cliente: { id: 1, nombre: 'Ana', apellidos: 'García' },
  vehiculo: {
    id: 1,
    referencia: 'REF-1',
    marca: 'BMW',
    modelo: 'Serie 1',
    matricula: '1234ABC',
    bastidor: 'WBA00000000000001',
    kms: 50000,
    estado: 'reservado',
  },
  // El botón "Generar Contrato de Venta" exige contratoReserva + estado
  // 'reservado' (canGenerateContratoVenta en deals/[id]/page.tsx).
  estado: 'reservado',
  contratoReserva: 'contrato-reserva.pdf',
  importeTotal: 20000,
  importeSena: 500,
  financiacion: false,
  fechaCreacion: '2026-01-01T00:00:00.000Z',
}

/** Deal reservado listo para contrato de venta, sin tocar la DB. */
async function mockDeal(page: Page) {
  await mockAuth(page)
  await page.route(/\/api\/deals\/1$/, (route) => route.fulfill({ json: DEAL }))
  await page.route(/\/api\/deals\/1\/notas/, (route) =>
    route.fulfill({ json: [] })
  )
  await page.route(/\/api\/deals\/1\/recordatorios/, (route) =>
    route.fulfill({ json: [] })
  )
}

async function abrirModal(page: Page) {
  await page.goto('/deals/1')
  const btn = page.getByRole('button', { name: 'Generar Contrato de Venta' })
  await expect(btn).toBeEnabled({ timeout: 30_000 })
  await btn.click()
  await expect(page.getByTestId('condiciones-pago-modal')).toBeVisible()
}

test.describe('Modal de condiciones de pago @comisiones', () => {
  test('no genera el contrato sin forma de pago ni sin garantía', async ({
    page,
  }) => {
    test.setTimeout(90_000)
    await mockDeal(page)

    // Si el modal dejara pasar la validación, esto se dispararía. Debe quedar
    // en 0 hasta que las condiciones sean válidas.
    const posts: unknown[] = []
    await page.route(/\/api\/deals\/1\/condiciones-pago/, async (route) => {
      if (route.request().method() === 'POST')
        posts.push(route.request().postDataJSON())
      await route.fulfill({ json: { ok: true } })
    })
    // El contrato se genera después de guardar las condiciones; lo cortamos
    // acá para no depender del generador de PDF.
    await page.route(/\/api\/documents\//, (route) => route.fulfill({ json: {} }))

    await abrirModal(page)
    const submit = page.getByTestId('condiciones-submit')
    const error = page.getByTestId('condiciones-error')

    // 1) Sin forma de pago.
    await submit.click()
    await expect(error).toHaveText('Elige la forma de pago')

    // 2) Con forma de pago pero sin elegir garantía premium (radio sin default).
    await page.getByTestId('forma-pago').selectOption('contado')
    await submit.click()
    await expect(error).toHaveText('Indica si lleva garantía premium (sí o no)')

    // Ninguna de las dos intentonas llegó al server.
    expect(posts).toHaveLength(0)

    // 3) Recién con la garantía elegida el modal deja pasar: cierra y POSTea
    // las condiciones capturadas.
    await page.getByTestId('garantia-no').check()
    await submit.click()
    await expect(page.getByTestId('condiciones-pago-modal')).toHaveCount(0)
    expect(posts).toHaveLength(1)
    expect(posts[0]).toMatchObject({
      formaPago: 'contado',
      garantiaPremium: false,
    })
  })

  test('"financiado" revela banco, interés, cuotas y monto financiado', async ({
    page,
  }) => {
    test.setTimeout(90_000)
    await mockDeal(page)
    await abrirModal(page)

    // Antes de elegir financiado el bloque de financiación no existe.
    await expect(page.getByTestId('banco')).toHaveCount(0)

    await page.getByTestId('forma-pago').selectOption('financiado')

    await expect(page.getByTestId('banco')).toBeVisible()
    await expect(page.getByTestId('interes')).toBeVisible()
    await expect(page.getByTestId('cuotas')).toBeVisible()
    await expect(page.getByTestId('monto-financiado')).toBeVisible()
    // Prefill editable con el precio de venta del deal.
    await expect(page.getByTestId('monto-financiado')).toHaveValue('20000')
    // "Monto al contado" es exclusivo de mixto.
    await expect(page.getByTestId('monto-contado')).toHaveCount(0)

    // Banco es obligatorio: con todo lo demás relleno, sin banco no pasa.
    await page.getByTestId('interes').fill('7.5')
    await page.getByTestId('cuotas').fill('60')
    await page.getByTestId('garantia-si').check()
    await page.getByTestId('condiciones-submit').click()
    await expect(page.getByTestId('condiciones-error')).toBeVisible()
  })

  test('"mixto" rechaza contado + financiado ≠ precio de venta', async ({
    page,
  }) => {
    test.setTimeout(90_000)
    await mockDeal(page)

    let condicionesPosts = 0
    await page.route(/\/api\/deals\/1\/condiciones-pago/, async (route) => {
      if (route.request().method() === 'POST') condicionesPosts++
      await route.fulfill({ json: { ok: true } })
    })

    await abrirModal(page)

    await page.getByTestId('forma-pago').selectOption('mixto')
    await expect(page.getByTestId('monto-contado')).toBeVisible()

    // Precio de venta = 20000. 5000 + 10000 = 15000 → NO suma.
    await page.getByTestId('banco').fill('Santander Consumer')
    await page.getByTestId('interes').fill('7.5')
    await page.getByTestId('cuotas').fill('60')
    await page.getByTestId('monto-financiado').fill('10000')
    await page.getByTestId('monto-contado').fill('5000')
    await page.getByTestId('garantia-no').check()

    // El aviso en vivo ya marca el descuadre.
    await expect(page.getByText(/faltan 5000[.,]00/)).toBeVisible()

    await page.getByTestId('condiciones-submit').click()

    // Error de validación y NADA enviado al server.
    await expect(page.getByTestId('condiciones-error')).toBeVisible()
    expect(condicionesPosts).toBe(0)

    // Corrigiendo a 4000 + 16000 = 20000 el descuadre desaparece y pasa.
    await page.getByTestId('monto-contado').fill('4000')
    await page.getByTestId('monto-financiado').fill('16000')
    await expect(page.getByText(/coincide con el precio de venta/)).toBeVisible()
  })
})

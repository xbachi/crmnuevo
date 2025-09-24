import { test, expect } from '@playwright/test'

test.describe('Deposit Workflow E2E Tests', () => {
  test.beforeEach(async ({ page }) => {
    // Navigate to the application
    await page.goto('/')

    // Wait for the page to load
    await expect(page).toHaveTitle(/CRM Seven Cars/)
  })

  test('Complete deposit creation workflow', async ({ page }) => {
    // Navigate to deposits page
    await page.click('[data-testid="nav-depositos"]')
    await expect(page).toHaveURL(/.*depositos/)

    // Click "Generar nuevo depósito" button
    await page.click('[data-testid="nuevo-deposito-btn"]')
    await expect(page).toHaveURL(/.*depositos\/nuevo/)

    // Step 1: Cliente section
    await expect(page.locator('[data-testid="cliente-section"]')).toBeVisible()

    // Search for existing client (should not find any)
    await page.fill('[data-testid="cliente-search"]', 'Juan Pérez')
    await page.keyboard.press('Enter')
    await page.waitForTimeout(1000)

    // Click "Crear nuevo cliente" button
    await page.click('[data-testid="crear-cliente-btn"]')
    await expect(page.locator('[data-testid="cliente-form"]')).toBeVisible()

    // Fill client form (mandatory fields for deposits)
    await page.fill('[data-testid="cliente-nombre"]', 'Juan')
    await page.fill('[data-testid="cliente-apellidos"]', 'Pérez García')
    await page.fill('[data-testid="cliente-email"]', 'juan.perez@test.com')
    await page.fill('[data-testid="cliente-telefono"]', '666123456')
    await page.fill('[data-testid="cliente-dni"]', '12345678A')

    // Mandatory address fields for deposits
    await page.fill('[data-testid="cliente-direccion"]', 'Calle Test 123')
    await page.fill('[data-testid="cliente-ciudad"]', 'Valencia')
    await page.fill('[data-testid="cliente-provincia"]', 'Valencia')
    await page.fill('[data-testid="cliente-codigo-postal"]', '46001')

    // Save client
    await page.click('[data-testid="guardar-cliente-btn"]')

    // Verify client was created and selected
    await expect(
      page.locator('[data-testid="cliente-selected"]')
    ).toContainText('Juan Pérez García')

    // Step 2: Vehicle section
    await expect(page.locator('[data-testid="vehiculo-section"]')).toBeVisible()

    // Search for existing vehicle (should not find any)
    await page.fill('[data-testid="vehiculo-search"]', 'BMW')
    await page.keyboard.press('Enter')
    await page.waitForTimeout(1000)

    // Click "Crear nuevo vehículo" button
    await page.click('[data-testid="crear-vehiculo-btn"]')
    await expect(page.locator('[data-testid="vehiculo-form"]')).toBeVisible()

    // Fill vehicle form (mandatory fields for deposits)
    await page.fill('[data-testid="vehiculo-marca"]', 'BMW')
    await page.fill('[data-testid="vehiculo-modelo"]', 'X5')
    await page.fill('[data-testid="vehiculo-matricula"]', '1234ABC')
    await page.fill('[data-testid="vehiculo-bastidor"]', 'WBAXXX123456789XX')
    await page.fill('[data-testid="vehiculo-kms"]', '75000')
    await page.fill(
      '[data-testid="vehiculo-fecha-matriculacion"]',
      '2020-05-15'
    )

    // Select tipo as 'D' for deposit
    await page.selectOption('[data-testid="vehiculo-tipo"]', 'D')

    // Save vehicle
    await page.click('[data-testid="guardar-vehiculo-btn"]')

    // Verify vehicle was created and selected
    await expect(
      page.locator('[data-testid="vehiculo-selected"]')
    ).toContainText('BMW X5')

    // Step 3: Financial information
    await expect(
      page.locator('[data-testid="financiero-section"]')
    ).toBeVisible()

    // Fill financial details
    await page.fill('[data-testid="monto-recibir"]', '15000')
    await page.fill('[data-testid="dias-gestion"]', '90')
    await page.fill('[data-testid="multa-retiro"]', '1000')
    await page.fill('[data-testid="numero-cuenta"]', 'ES1234567890123456789012')

    // Create deposit
    await page.click('[data-testid="crear-deposito-btn"]')

    // Should redirect to deposit detail page
    await expect(page).toHaveURL(/.*depositos\/\d+/)

    // Verify deposit was created successfully
    await expect(page.locator('[data-testid="deposito-titulo"]')).toContainText(
      'Depósito #'
    )
    await expect(page.locator('[data-testid="deposito-estado"]')).toContainText(
      'ACTIVO'
    )

    // Verify client and vehicle information are displayed
    await expect(page.locator('[data-testid="cliente-info"]')).toContainText(
      'Juan Pérez García'
    )
    await expect(page.locator('[data-testid="vehiculo-info"]')).toContainText(
      'BMW X5'
    )

    // Verify financial information
    await expect(page.locator('[data-testid="monto-info"]')).toContainText(
      '15.000€'
    )
    await expect(page.locator('[data-testid="dias-info"]')).toContainText(
      '90 días'
    )
  })

  test('Generate deposit contract workflow', async ({ page }) => {
    // First create a deposit (simplified setup)
    await setupTestDeposit(page)

    // Navigate to deposit detail page
    await page.goto('/depositos/1') // Assuming ID 1 from setup

    // Verify "Generar Contrato de Depósito" button is visible and enabled
    await expect(
      page.locator('[data-testid="generar-contrato-deposito"]')
    ).toBeVisible()
    await expect(
      page.locator('[data-testid="generar-contrato-deposito"]')
    ).toBeEnabled()

    // Click generate contract button
    await page.click('[data-testid="generar-contrato-deposito"]')

    // Wait for contract generation
    await page.waitForTimeout(3000)

    // Verify button state changed to "Contrato Generado"
    await expect(
      page.locator('[data-testid="generar-contrato-deposito"]')
    ).toContainText('Contrato Generado')
    await expect(
      page.locator('[data-testid="generar-contrato-deposito"]')
    ).toHaveClass(/bg-green/)

    // Verify download button appears in documentation section
    await expect(
      page.locator('[data-testid="descargar-contrato-deposito"]')
    ).toBeVisible()
    await expect(
      page.locator('[data-testid="descargar-contrato-deposito"]')
    ).toBeEnabled()

    // Verify deposit state changed to appropriate status
    await page.reload()
    await expect(page.locator('[data-testid="deposito-estado"]')).toContainText(
      'ACTIVO'
    )
  })

  test('Mark deposit as sold workflow', async ({ page }) => {
    // Setup deposit with generated contract
    await setupTestDepositWithContract(page)

    // Navigate to deposit detail page
    await page.goto('/depositos/1')

    // Find and click the "Marcar como vendido" toggle
    await expect(
      page.locator('[data-testid="marcar-vendido-toggle"]')
    ).toBeVisible()
    await page.click('[data-testid="marcar-vendido-toggle"]')

    // Wait for state update
    await page.waitForTimeout(1000)

    // Verify deposit state changed to VENDIDO
    await expect(page.locator('[data-testid="deposito-estado"]')).toContainText(
      'VENDIDO'
    )

    // Verify "Generar Contrato de Compra" button is now enabled
    await expect(
      page.locator('[data-testid="generar-contrato-compra"]')
    ).toBeVisible()
    await expect(
      page.locator('[data-testid="generar-contrato-compra"]')
    ).toBeEnabled()
  })

  test('Add notes to deposit workflow', async ({ page }) => {
    // Setup test deposit
    await setupTestDeposit(page)

    // Navigate to deposit detail page
    await page.goto('/depositos/1')

    // Scroll to notes section
    await page.locator('[data-testid="notas-section"]').scrollIntoViewIfNeeded()

    // Add a new note
    await page.fill(
      '[data-testid="nueva-nota-textarea"]',
      'Cliente llamó para consultar el estado del vehículo'
    )
    await page.click('[data-testid="agregar-nota-btn"]')

    // Wait for note to be added
    await page.waitForTimeout(1000)

    // Verify note appears in the list
    await expect(
      page.locator('[data-testid="nota-item"]').first()
    ).toContainText('Cliente llamó para consultar')

    // Verify note metadata
    await expect(
      page.locator('[data-testid="nota-fecha"]').first()
    ).toBeVisible()
    await expect(
      page.locator('[data-testid="nota-usuario"]').first()
    ).toContainText('Sistema')

    // Test note editing
    await page.click('[data-testid="editar-nota-btn"]')
    await page.fill(
      '[data-testid="editar-nota-textarea"]',
      'Cliente llamó para consultar el estado del vehículo - URGENTE'
    )
    await page.click('[data-testid="guardar-nota-btn"]')

    // Verify note was updated
    await expect(
      page.locator('[data-testid="nota-item"]').first()
    ).toContainText('URGENTE')
  })

  test('Download contracts workflow', async ({ page }) => {
    // Setup deposit with contracts
    await setupTestDepositWithContracts(page)

    // Navigate to deposit detail page
    await page.goto('/depositos/1')

    // Test download deposit contract
    const downloadPromise1 = page.waitForEvent('download')
    await page.click('[data-testid="descargar-contrato-deposito"]')
    const download1 = await downloadPromise1

    // Verify download started
    expect(download1.suggestedFilename()).toMatch(/contrato.*deposito.*\.pdf/)

    // Mark as sold and generate sale contract
    await page.click('[data-testid="marcar-vendido-toggle"]')
    await page.waitForTimeout(1000)

    await page.click('[data-testid="generar-contrato-compra"]')
    await page.waitForTimeout(3000)

    // Test download sale contract
    const downloadPromise2 = page.waitForEvent('download')
    await page.click('[data-testid="descargar-contrato-compra"]')
    const download2 = await downloadPromise2

    // Verify download started
    expect(download2.suggestedFilename()).toMatch(/contrato.*compra.*\.pdf/)
  })

  test('Deposit list and filters workflow', async ({ page }) => {
    // Navigate to deposits page
    await page.goto('/depositos')

    // Verify page elements
    await expect(
      page.locator('[data-testid="depositos-titulo"]')
    ).toContainText('Depósitos de venta')
    await expect(
      page.locator('[data-testid="nuevo-deposito-btn"]')
    ).toBeVisible()

    // Verify statistics blocks
    await expect(page.locator('[data-testid="total-depositos"]')).toBeVisible()
    await expect(
      page.locator('[data-testid="depositos-activos"]')
    ).toBeVisible()
    await expect(
      page.locator('[data-testid="depositos-finalizados"]')
    ).toBeVisible()

    // Test filters
    await page.selectOption('[data-testid="estado-filter"]', 'ACTIVO')
    await page.waitForTimeout(500)

    // Verify filtered results
    const rows = page.locator('[data-testid="deposito-row"]')
    const count = await rows.count()

    if (count > 0) {
      // Verify all visible deposits have "ACTIVO" state
      for (let i = 0; i < count; i++) {
        await expect(
          rows.nth(i).locator('[data-testid="deposito-estado"]')
        ).toContainText('ACTIVO')
      }
    }

    // Test search functionality
    await page.fill('[data-testid="search-input"]', 'BMW')
    await page.keyboard.press('Enter')
    await page.waitForTimeout(500)

    // Verify search results contain BMW
    const searchResults = page.locator('[data-testid="deposito-row"]')
    const searchCount = await searchResults.count()

    if (searchCount > 0) {
      await expect(searchResults.first()).toContainText('BMW')
    }
  })

  test('Error handling and validation', async ({ page }) => {
    // Navigate to create deposit page
    await page.goto('/depositos/nuevo')

    // Try to create deposit without client
    await page.click('[data-testid="crear-deposito-btn"]')

    // Verify error message
    await expect(page.locator('[data-testid="error-message"]')).toContainText(
      'Debes seleccionar un cliente'
    )

    // Select client but not vehicle
    await setupClientOnly(page)
    await page.click('[data-testid="crear-deposito-btn"]')

    // Verify error message
    await expect(page.locator('[data-testid="error-message"]')).toContainText(
      'Debes seleccionar un vehículo'
    )

    // Test invalid financial data
    await setupClientAndVehicle(page)
    await page.fill('[data-testid="monto-recibir"]', '-1000') // Negative amount
    await page.click('[data-testid="crear-deposito-btn"]')

    // Verify validation error
    await expect(
      page.locator('[data-testid="validation-error"]')
    ).toContainText('El monto debe ser positivo')

    // Test invalid days
    await page.fill('[data-testid="monto-recibir"]', '15000')
    await page.fill('[data-testid="dias-gestion"]', '0') // Zero days
    await page.click('[data-testid="crear-deposito-btn"]')

    // Verify validation error
    await expect(
      page.locator('[data-testid="validation-error"]')
    ).toContainText('Los días de gestión deben ser mayor a 0')
  })
})

// Helper functions for test setup
async function setupTestDeposit(page: any) {
  // Implementation would create a basic deposit via API or UI
  // This is a placeholder for the actual setup logic
  await page.evaluate(() => {
    // Mock API call to create test deposit
    return fetch('/api/test-setup/deposit', { method: 'POST' })
  })
}

async function setupTestDepositWithContract(page: any) {
  await setupTestDeposit(page)
  // Additional setup for contract generation
  await page.evaluate(() => {
    return fetch('/api/test-setup/deposit-contract', { method: 'POST' })
  })
}

async function setupTestDepositWithContracts(page: any) {
  await setupTestDepositWithContract(page)
  // Setup for both deposit and sale contracts
  await page.evaluate(() => {
    return fetch('/api/test-setup/deposit-contracts-all', { method: 'POST' })
  })
}

async function setupClientOnly(page: any) {
  // Create and select a client without vehicle
  await page.click('[data-testid="crear-cliente-btn"]')
  await page.fill('[data-testid="cliente-nombre"]', 'Test')
  await page.fill('[data-testid="cliente-apellidos"]', 'Client')
  await page.fill('[data-testid="cliente-direccion"]', 'Test Address')
  await page.fill('[data-testid="cliente-ciudad"]', 'Test City')
  await page.fill('[data-testid="cliente-provincia"]', 'Test Province')
  await page.fill('[data-testid="cliente-codigo-postal"]', '12345')
  await page.click('[data-testid="guardar-cliente-btn"]')
}

async function setupClientAndVehicle(page: any) {
  await setupClientOnly(page)

  // Create and select a vehicle
  await page.click('[data-testid="crear-vehiculo-btn"]')
  await page.fill('[data-testid="vehiculo-marca"]', 'Test')
  await page.fill('[data-testid="vehiculo-modelo"]', 'Model')
  await page.fill('[data-testid="vehiculo-matricula"]', 'TEST123')
  await page.fill('[data-testid="vehiculo-bastidor"]', 'TESTXXXXXXXXX1234')
  await page.fill('[data-testid="vehiculo-kms"]', '50000')
  await page.fill('[data-testid="vehiculo-fecha-matriculacion"]', '2020-01-01')
  await page.selectOption('[data-testid="vehiculo-tipo"]', 'D')
  await page.click('[data-testid="guardar-vehiculo-btn"]')
}

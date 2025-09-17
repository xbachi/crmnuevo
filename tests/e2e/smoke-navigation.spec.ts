import { test, expect } from '@playwright/test'

/**
 * Smoke tests for basic navigation and page loading
 * These tests ensure all main pages load without errors
 * Tagged with @smoke for quick CI checks
 */

test.describe('Smoke Tests - Navigation @smoke', () => {
  test.beforeEach(async ({ page }) => {
    // Suppress console errors during smoke tests unless critical
    page.on('console', msg => {
      if (msg.type() === 'error') {
        console.log(`Console error: ${msg.text()}`)
      }
    })
  })

  test('Homepage loads successfully', async ({ page }) => {
    await page.goto('/')
    
    // Check for basic page elements
    await expect(page).toHaveTitle(/CRM Seven Cars|CRM|Seven Cars/)
    
    // Should have navigation elements
    await expect(page.locator('nav, [data-testid="navigation"]')).toBeVisible()
    
    // Should load without critical console errors
    const errors = []
    page.on('console', msg => {
      if (msg.type() === 'error') {
        errors.push(msg.text())
      }
    })
    
    await page.waitForLoadState('networkidle')
    
    // Filter out non-critical errors
    const criticalErrors = errors.filter(error => 
      !error.includes('favicon') && 
      !error.includes('404') &&
      !error.includes('chrome-extension')
    )
    
    expect(criticalErrors).toHaveLength(0)
  })

  test('Clientes page loads', async ({ page }) => {
    await page.goto('/clientes')
    
    await expect(page).toHaveURL(/.*clientes/)
    await expect(page.locator('h1, [data-testid="page-title"]')).toBeVisible()
    
    // Should have list or empty state
    await expect(
      page.locator('[data-testid="clientes-list"], [data-testid="empty-state"]')
    ).toBeVisible({ timeout: 10000 })
  })

  test('Vehiculos page loads', async ({ page }) => {
    await page.goto('/vehiculos')
    
    await expect(page).toHaveURL(/.*vehiculos/)
    await expect(page.locator('h1, [data-testid="page-title"]')).toBeVisible()
    
    // Should have vehicle list or empty state
    await expect(
      page.locator('[data-testid="vehiculos-list"], [data-testid="empty-state"]')
    ).toBeVisible({ timeout: 10000 })
  })

  test('Deals page loads', async ({ page }) => {
    await page.goto('/deals')
    
    await expect(page).toHaveURL(/.*deals/)
    await expect(page.locator('h1, [data-testid="page-title"]')).toBeVisible()
    
    // Should have deals list or empty state
    await expect(
      page.locator('[data-testid="deals-list"], [data-testid="empty-state"]')
    ).toBeVisible({ timeout: 10000 })
  })

  test('Depositos page loads', async ({ page }) => {
    await page.goto('/depositos')
    
    await expect(page).toHaveURL(/.*depositos/)
    await expect(page.locator('h1, [data-testid="page-title"]')).toBeVisible()
    
    // Should have deposits list or empty state
    await expect(
      page.locator('[data-testid="depositos-list"], [data-testid="empty-state"]')
    ).toBeVisible({ timeout: 10000 })
  })

  test('Inversores page loads', async ({ page }) => {
    await page.goto('/inversores')
    
    await expect(page).toHaveURL(/.*inversores/)
    await expect(page.locator('h1, [data-testid="page-title"]')).toBeVisible()
    
    // Should have investors list or empty state
    await expect(
      page.locator('[data-testid="inversores-list"], [data-testid="empty-state"]')
    ).toBeVisible({ timeout: 10000 })
  })

  test('Kanban page loads', async ({ page }) => {
    await page.goto('/kanban')
    
    await expect(page).toHaveURL(/.*kanban/)
    await expect(page.locator('h1, [data-testid="page-title"]')).toBeVisible()
    
    // Should have kanban columns
    await expect(page.locator('[data-testid="kanban-column"]')).toBeVisible({ timeout: 10000 })
  })

  test('Navigation links work', async ({ page }) => {
    await page.goto('/')
    
    // Test main navigation links
    const navLinks = [
      { selector: '[data-testid="nav-clientes"], a[href*="clientes"]', url: '/clientes' },
      { selector: '[data-testid="nav-vehiculos"], a[href*="vehiculos"]', url: '/vehiculos' },
      { selector: '[data-testid="nav-deals"], a[href*="deals"]', url: '/deals' },
      { selector: '[data-testid="nav-depositos"], a[href*="depositos"]', url: '/depositos' },
      { selector: '[data-testid="nav-inversores"], a[href*="inversores"]', url: '/inversores' },
    ]
    
    for (const link of navLinks) {
      const linkElement = page.locator(link.selector).first()
      
      if (await linkElement.isVisible()) {
        await linkElement.click()
        await expect(page).toHaveURL(new RegExp(link.url.replace('/', '\\/')))
        await page.goBack()
        await page.waitForLoadState('networkidle')
      }
    }
  })

  test('Create forms load without errors', async ({ page }) => {
    const createPages = [
      '/clientes/crear',
      '/cargar-vehiculo',
      '/deals/crear',
      '/depositos/nuevo'
    ]
    
    for (const createPage of createPages) {
      await page.goto(createPage)
      
      // Should load without errors
      await expect(page).toHaveURL(new RegExp(createPage.replace('/', '\\/')))
      
      // Should have form elements
      await expect(
        page.locator('form, [data-testid="form"], input, textarea, select')
      ).toBeVisible({ timeout: 5000 })
      
      // Should have save/submit button
      await expect(
        page.locator('button[type="submit"], [data-testid="submit"], [data-testid="save"]')
      ).toBeVisible()
    }
  })

  test('Dashboard metrics load', async ({ page }) => {
    await page.goto('/')
    
    // Should have dashboard metrics/cards
    await expect(
      page.locator('[data-testid="metric"], .metric, .dashboard-card, .stat-card')
    ).toBeVisible({ timeout: 10000 })
    
    // Check for specific metrics if they exist
    const metricSelectors = [
      '[data-testid="total-vehiculos"]',
      '[data-testid="total-clientes"]',
      '[data-testid="total-deals"]',
      '[data-testid="total-depositos"]',
    ]
    
    let visibleMetrics = 0
    for (const selector of metricSelectors) {
      if (await page.locator(selector).isVisible()) {
        visibleMetrics++
      }
    }
    
    // Should have at least some metrics visible
    expect(visibleMetrics).toBeGreaterThan(0)
  })

  test('Search functionality works', async ({ page }) => {
    // Test global search if it exists
    const searchSelectors = [
      '[data-testid="global-search"]',
      'input[placeholder*="buscar"], input[placeholder*="search"]',
      '.search-input'
    ]
    
    await page.goto('/')
    
    for (const selector of searchSelectors) {
      const searchInput = page.locator(selector).first()
      
      if (await searchInput.isVisible()) {
        await searchInput.fill('test')
        await page.keyboard.press('Enter')
        
        // Should handle search without crashing
        await page.waitForTimeout(1000)
        break
      }
    }
  })

  test('Mobile viewport works', async ({ page }) => {
    // Set mobile viewport
    await page.setViewportSize({ width: 375, height: 667 })
    
    await page.goto('/')
    
    // Should be responsive
    await expect(page.locator('body')).toBeVisible()
    
    // Navigation should adapt to mobile
    const mobileNav = page.locator('[data-testid="mobile-nav"], .mobile-menu, .hamburger')
    
    if (await mobileNav.isVisible()) {
      await mobileNav.click()
      // Should open mobile menu
      await expect(
        page.locator('[data-testid="mobile-menu"], .mobile-menu-open')
      ).toBeVisible()
    }
  })

  test('Error pages handle gracefully', async ({ page }) => {
    // Test 404 page
    await page.goto('/non-existent-page')
    
    // Should show error page or redirect
    const url = page.url()
    const isErrorPage = url.includes('404') || url.includes('error')
    const isRedirect = !url.includes('non-existent-page')
    
    expect(isErrorPage || isRedirect).toBe(true)
  })

  test('Form validation shows user-friendly errors', async ({ page }) => {
    await page.goto('/clientes/crear')
    
    // Try to submit empty form
    const submitButton = page.locator('button[type="submit"], [data-testid="submit"]').first()
    
    if (await submitButton.isVisible()) {
      await submitButton.click()
      
      // Should show validation errors
      await expect(
        page.locator('.error, .invalid, [data-testid="error"], .text-red')
      ).toBeVisible({ timeout: 3000 })
    }
  })
})

test.describe('Performance Smoke Tests @smoke', () => {
  test('Pages load within reasonable time', async ({ page }) => {
    const pages = ['/', '/clientes', '/vehiculos', '/deals', '/depositos']
    
    for (const pagePath of pages) {
      const startTime = Date.now()
      
      await page.goto(pagePath)
      await page.waitForLoadState('networkidle')
      
      const loadTime = Date.now() - startTime
      
      // Should load within 5 seconds (reasonable for development)
      expect(loadTime).toBeLessThan(5000)
      
      console.log(`${pagePath} loaded in ${loadTime}ms`)
    }
  })

  test('API responses are timely', async ({ page }) => {
    await page.goto('/')
    
    // Intercept API calls and measure response times
    const apiTimes = []
    
    page.on('response', response => {
      if (response.url().includes('/api/')) {
        const timing = response.request().timing()
        if (timing) {
          apiTimes.push({
            url: response.url(),
            status: response.status(),
            time: timing.responseEnd - timing.responseStart
          })
        }
      }
    })
    
    // Navigate to pages that make API calls
    await page.goto('/clientes')
    await page.waitForTimeout(2000)
    
    await page.goto('/vehiculos')
    await page.waitForTimeout(2000)
    
    // Check API response times
    const slowApis = apiTimes.filter(api => api.time > 2000)
    
    if (slowApis.length > 0) {
      console.warn('Slow API responses detected:', slowApis)
    }
    
    // Most APIs should respond within 2 seconds
    expect(slowApis.length / apiTimes.length).toBeLessThan(0.5)
  })
})

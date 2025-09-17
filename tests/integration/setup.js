const { initializeTestDatabase } = require('../fixtures/database')

// Setup for integration tests
beforeAll(async () => {
  console.log('Setting up integration test environment...')
  await initializeTestDatabase()
}, 30000)

// Mock environment variables for tests
process.env.NODE_ENV = 'test'
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL || 'postgresql://test:test@localhost:5432/crm_test'

// Suppress console logs during tests unless DEBUG is set
if (!process.env.DEBUG) {
  global.console = {
    ...console,
    log: jest.fn(),
    warn: jest.fn(),
    info: jest.fn(),
  }
}

// Global test timeout
jest.setTimeout(30000)

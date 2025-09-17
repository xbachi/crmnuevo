const baseConfig = require('./jest.config.js')

module.exports = {
  ...baseConfig,
  testEnvironment: 'node',
  setupFilesAfterEnv: ['<rootDir>/tests/integration/setup.js'],
  testMatch: [
    '<rootDir>/tests/integration/**/*.{js,jsx,ts,tsx}',
  ],
  collectCoverageFrom: [
    'src/app/api/**/*.{js,jsx,ts,tsx}',
    'src/lib/**/*.{js,jsx,ts,tsx}',
    '!src/**/*.d.ts',
  ],
  coverageThreshold: {
    global: {
      branches: 60,
      functions: 60,
      lines: 60,
      statements: 60
    }
  },
  testTimeout: 60000,
  maxWorkers: 1, // Sequential for database tests
}

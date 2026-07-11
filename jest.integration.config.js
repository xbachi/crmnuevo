const createBaseConfig = require('./jest.config.js')

module.exports = async () => {
  const baseConfig = await createBaseConfig()

  return {
    ...baseConfig,
    testEnvironment: 'node',
    setupFilesAfterEnv: ['<rootDir>/tests/integration/setup.js'],
    testMatch: ['<rootDir>/tests/integration/**/*.{js,jsx,ts,tsx}'],
    testPathIgnorePatterns: [
      ...(baseConfig.testPathIgnorePatterns ?? []),
      '<rootDir>/tests/integration/setup.js',
      '<rootDir>/.claude/worktrees/',
    ],
    modulePathIgnorePatterns: [
      ...(baseConfig.modulePathIgnorePatterns ?? []),
      '<rootDir>/.claude/worktrees/',
    ],
    transformIgnorePatterns: [
      'node_modules/(?!@faker-js/faker/)',
      '^.+\\.module\\.(css|sass|scss)$',
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
        statements: 60,
      },
    },
    testTimeout: 60000,
    maxWorkers: 1,
  }
}

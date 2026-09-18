// jest.config.js exporta la función async de next/jest (no un objeto): hay que
// resolverla antes de extenderla, si no jest no transpila TypeScript.
const baseConfig = require('./jest.config.js')

module.exports = async () => {
  const base = await baseConfig()
  return {
    ...base,
    testEnvironment: 'node',
    setupFilesAfterEnv: ['<rootDir>/tests/integration/setup.js'],
    // Solo *.test.*: setup.js y sesion.ts son helpers, no suites.
    testMatch: ['<rootDir>/tests/integration/**/*.test.{js,jsx,ts,tsx}'],
    // @faker-js/faker (fixtures) es ESM puro: next/jest ignora node_modules
    // salvo lo que se liste aquí (esto sustituye su patrón por defecto).
    transformIgnorePatterns: ['/node_modules/(?!@faker-js/faker/)'],
    collectCoverageFrom: [
      'src/app/api/**/*.{js,jsx,ts,tsx}',
      'src/lib/**/*.{js,jsx,ts,tsx}',
      '!src/**/*.d.ts',
    ],
    coverageThreshold: base.coverageThreshold,
    testTimeout: 60000,
    maxWorkers: 1, // Sequential for database tests
    forceExit: true, // supertest deja sockets keep-alive abiertos
  }
}

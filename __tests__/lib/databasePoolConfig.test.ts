import { DATABASE_POOL_MAX } from '@/lib/databasePoolConfig'

describe('configuración del pool PostgreSQL', () => {
  it('limita cada instancia serverless a una conexión', () => {
    expect(DATABASE_POOL_MAX).toBe(1)
  })
})

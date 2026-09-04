import { getSessionSecret, getSessionSecretSource } from '@/lib/sessionSecret'

const ORIGINAL = { ...process.env }
function setEnv(vars: Record<string, string | undefined>) {
  for (const k of [
    'SESSION_SECRET',
    'CRON_SECRET',
    'N8N_INVOICE_WEBHOOK_SECRET',
    'DATABASE_URL',
  ])
    delete process.env[k]
  Object.assign(process.env, vars)
}

describe('getSessionSecret', () => {
  afterEach(() => {
    process.env = { ...ORIGINAL }
  })

  it('usa SESSION_SECRET cuando existe', () => {
    setEnv({ SESSION_SECRET: 'abc', NODE_ENV: 'production' })
    expect(getSessionSecret()).toBe('abc')
    expect(getSessionSecretSource()).toBe('env')
  })

  it('en producción sin SESSION_SECRET deriva de otro secreto y no lanza', () => {
    setEnv({ NODE_ENV: 'production', CRON_SECRET: 'cron-xyz' })
    const spy = jest.spyOn(console, 'error').mockImplementation(() => {})
    expect(getSessionSecret()).toBe('derivado:cron-xyz')
    expect(getSessionSecretSource()).toBe('derivado')
    spy.mockRestore()
  })

  it('en producción sin ningún secreto lanza', () => {
    setEnv({ NODE_ENV: 'production' })
    expect(() => getSessionSecret()).toThrow('SESSION_SECRET no configurado')
  })

  it('en desarrollo usa el valor fijo', () => {
    setEnv({ NODE_ENV: 'test' })
    expect(getSessionSecret()).toContain('dev-only')
    expect(getSessionSecretSource()).toBe('dev')
  })
})

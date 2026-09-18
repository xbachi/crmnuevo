/**
 * Inicia sesión una vez por API con el usuario que siembra
 * scripts/setup-test-database.js y guarda la cookie (storageState) para todos
 * los proyectos. Sin esto, cada página del CRM redirige a /login.
 */
import { request, type FullConfig } from '@playwright/test'
import fs from 'fs'
import path from 'path'

export const STORAGE_STATE = path.join(
  __dirname,
  '..',
  '..',
  'qa',
  'artifacts',
  'e2e-storage-state.json'
)

export default async function globalSetup(config: FullConfig) {
  const baseURL =
    config.projects[0]?.use?.baseURL ||
    process.env.E2E_BASE_URL ||
    'http://localhost:3000'
  const ctx = await request.newContext({ baseURL })
  const res = await ctx.post('/api/auth/login', {
    data: {
      email: process.env.E2E_USER_EMAIL || 'e2e@sevencars.test',
      password: process.env.E2E_USER_PASSWORD || 'e2e-password',
    },
  })
  if (!res.ok()) {
    throw new Error(
      `Login E2E falló (${res.status()}): ${await res.text()}. ¿Corrió npm run db:test:setup?`
    )
  }
  fs.mkdirSync(path.dirname(STORAGE_STATE), { recursive: true })
  await ctx.storageState({ path: STORAGE_STATE })
  await ctx.dispose()
}

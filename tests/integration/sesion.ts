/**
 * Agente supertest con la sesión del usuario que siembra
 * scripts/setup-test-database.js (E2E_USER_EMAIL / E2E_USER_PASSWORD).
 * El middleware exige cookie en /api/*, así que todos los tests pasan por aquí.
 */
import request from 'supertest'

export const baseUrl = process.env.TEST_BASE_URL || 'http://localhost:3000'

export const api = request.agent(baseUrl)

export async function iniciarSesion(): Promise<void> {
  const res = await api.post('/api/auth/login').send({
    email: process.env.E2E_USER_EMAIL || 'e2e@sevencars.test',
    password: process.env.E2E_USER_PASSWORD || 'e2e-password',
  })
  if (res.status !== 200) {
    throw new Error(
      `Login de test falló (${res.status}): ${JSON.stringify(res.body)}`
    )
  }
}

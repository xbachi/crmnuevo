/**
 * Cliente HTTP con la sesión del usuario que siembra
 * scripts/setup-test-database.js (E2E_USER_EMAIL / E2E_USER_PASSWORD).
 * El middleware exige cookie en /api/*, así que todos los tests pasan por aquí.
 *
 * La cookie se manda a mano: en producción (`next start`, como en CI) lleva
 * `Secure` y el jar de supertest la descarta sobre http://localhost.
 */
import request from 'supertest'

export const baseUrl = process.env.TEST_BASE_URL || 'http://localhost:3000'

let cookie = ''

export async function iniciarSesion(): Promise<void> {
  const res = await request(baseUrl)
    .post('/api/auth/login')
    .send({
      email: process.env.E2E_USER_EMAIL || 'e2e@sevencars.test',
      password: process.env.E2E_USER_PASSWORD || 'e2e-password',
    })
  if (res.status !== 200) {
    throw new Error(
      `Login de test falló (${res.status}): ${JSON.stringify(res.body)}`
    )
  }
  const setCookie = res.headers['set-cookie']
  const lineas = Array.isArray(setCookie) ? setCookie : [setCookie ?? '']
  cookie = lineas.map((l) => l.split(';')[0]).join('; ')
  if (!cookie) throw new Error('El login no devolvió cookie de sesión')
}

const conSesion = (r: request.Test) => r.set('Cookie', cookie)

export const api = {
  get: (path: string) => conSesion(request(baseUrl).get(path)),
  post: (path: string) => conSesion(request(baseUrl).post(path)),
  put: (path: string) => conSesion(request(baseUrl).put(path)),
  delete: (path: string) => conSesion(request(baseUrl).delete(path)),
}

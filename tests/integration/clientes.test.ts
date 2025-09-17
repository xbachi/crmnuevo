/**
 * @jest-environment node
 */

import { describe, test, expect, beforeAll, afterAll, beforeEach } from '@jest/globals'
import request from 'supertest'
import { createServer } from 'http'
import { NextApiHandler } from 'next'
import { createTestCliente, createTestClientes } from '../fixtures/factories'
import { 
  initializeTestDatabase, 
  cleanupDatabase, 
  closeTestDb,
  createTestClienteInDb,
} from '../fixtures/database'

// Mock Next.js API route handler
const createTestServer = (handler: NextApiHandler) => {
  const server = createServer((req, res) => {
    // Simple request/response wrapper for testing
    const mockReq = {
      ...req,
      query: {},
      body: {},
      method: req.method,
      url: req.url,
    } as any

    const mockRes = {
      ...res,
      status: (code: number) => {
        res.statusCode = code
        return mockRes
      },
      json: (data: any) => {
        res.setHeader('Content-Type', 'application/json')
        res.end(JSON.stringify(data))
        return mockRes
      },
      end: (data?: any) => {
        if (data) res.write(data)
        res.end()
        return mockRes
      },
    }

    return handler(mockReq, mockRes)
  })
  
  return server
}

describe('Cliente API Integration Tests', () => {
  beforeAll(async () => {
    await initializeTestDatabase()
  })

  afterAll(async () => {
    await closeTestDb()
  })

  beforeEach(async () => {
    await cleanupDatabase()
  })

  describe('POST /api/clientes', () => {
    test('creates a new cliente successfully', async () => {
      const clienteData = createTestCliente({
        nombre: 'Juan',
        apellidos: 'Pérez',
        email: 'juan.perez@test.com',
        telefono: '666123456',
        dni: '12345678A'
      })

      const response = await request('http://localhost:3000')
        .post('/api/clientes')
        .send(clienteData)
        .expect(200)

      expect(response.body).toMatchObject({
        id: expect.any(Number),
        nombre: 'Juan',
        apellidos: 'Pérez',
        email: 'juan.perez@test.com',
        telefono: '666123456',
        dni: '12345678A',
        estado: 'nuevo',
        prioridad: 'media',
        activo: true,
      })
    })

    test('validates required fields', async () => {
      const invalidData = {
        // Missing nombre and apellidos
        email: 'test@test.com'
      }

      const response = await request('http://localhost:3000')
        .post('/api/clientes')
        .send(invalidData)
        .expect(400)

      expect(response.body).toHaveProperty('error')
    })

    test('enforces DNI uniqueness', async () => {
      const clienteData = createTestCliente({ dni: '12345678A' })
      
      // Create first cliente
      await request('http://localhost:3000')
        .post('/api/clientes')
        .send(clienteData)
        .expect(200)

      // Try to create second cliente with same DNI
      const duplicateData = createTestCliente({ dni: '12345678A' })
      
      const response = await request('http://localhost:3000')
        .post('/api/clientes')
        .send(duplicateData)
        .expect(400)

      expect(response.body).toHaveProperty('error')
      expect(response.body.error).toContain('DNI')
    })

    test('handles missing optional fields gracefully', async () => {
      const minimalData = {
        nombre: 'Test',
        apellidos: 'User',
      }

      const response = await request('http://localhost:3000')
        .post('/api/clientes')
        .send(minimalData)
        .expect(200)

      expect(response.body).toMatchObject({
        nombre: 'Test',
        apellidos: 'User',
        estado: 'nuevo',
        prioridad: 'media',
        activo: true,
      })
    })
  })

  describe('GET /api/clientes', () => {
    test('returns empty list when no clientes exist', async () => {
      const response = await request('http://localhost:3000')
        .get('/api/clientes')
        .expect(200)

      expect(response.body).toEqual([])
    })

    test('returns list of clientes', async () => {
      // Create test clientes
      const clientes = createTestClientes(3)
      for (const cliente of clientes) {
        await createTestClienteInDb(cliente)
      }

      const response = await request('http://localhost:3000')
        .get('/api/clientes')
        .expect(200)

      expect(response.body).toHaveLength(3)
      expect(response.body[0]).toHaveProperty('id')
      expect(response.body[0]).toHaveProperty('nombre')
      expect(response.body[0]).toHaveProperty('apellidos')
    })

    test('supports search functionality', async () => {
      const cliente = createTestCliente({
        nombre: 'Searchable',
        apellidos: 'Name',
        email: 'searchable@test.com'
      })
      await createTestClienteInDb(cliente)

      const response = await request('http://localhost:3000')
        .get('/api/clientes?search=Searchable')
        .expect(200)

      expect(response.body).toHaveLength(1)
      expect(response.body[0].nombre).toBe('Searchable')
    })

    test('supports pagination', async () => {
      // Create 15 test clientes
      const clientes = createTestClientes(15)
      for (const cliente of clientes) {
        await createTestClienteInDb(cliente)
      }

      const response = await request('http://localhost:3000')
        .get('/api/clientes?page=1&limit=10')
        .expect(200)

      expect(response.body).toHaveLength(10)
    })
  })

  describe('GET /api/clientes/[id]', () => {
    test('returns specific cliente', async () => {
      const cliente = createTestCliente()
      const clienteId = await createTestClienteInDb(cliente)

      const response = await request('http://localhost:3000')
        .get(`/api/clientes/${clienteId}`)
        .expect(200)

      expect(response.body).toMatchObject({
        id: clienteId,
        nombre: cliente.nombre,
        apellidos: cliente.apellidos,
      })
    })

    test('returns 404 for non-existent cliente', async () => {
      const response = await request('http://localhost:3000')
        .get('/api/clientes/99999')
        .expect(404)

      expect(response.body).toHaveProperty('error')
    })
  })

  describe('PUT /api/clientes/[id]', () => {
    test('updates cliente successfully', async () => {
      const cliente = createTestCliente()
      const clienteId = await createTestClienteInDb(cliente)

      const updateData = {
        nombre: 'Updated Name',
        telefono: '999888777'
      }

      const response = await request('http://localhost:3000')
        .put(`/api/clientes/${clienteId}`)
        .send(updateData)
        .expect(200)

      expect(response.body).toMatchObject({
        id: clienteId,
        nombre: 'Updated Name',
        telefono: '999888777',
        apellidos: cliente.apellidos, // Should remain unchanged
      })
    })

    test('validates DNI uniqueness on update', async () => {
      const cliente1 = createTestCliente({ dni: '11111111A' })
      const cliente2 = createTestCliente({ dni: '22222222B' })
      
      const cliente1Id = await createTestClienteInDb(cliente1)
      await createTestClienteInDb(cliente2)

      // Try to update cliente1 with cliente2's DNI
      const response = await request('http://localhost:3000')
        .put(`/api/clientes/${cliente1Id}`)
        .send({ dni: '22222222B' })
        .expect(400)

      expect(response.body).toHaveProperty('error')
      expect(response.body.error).toContain('DNI')
    })

    test('returns 404 for non-existent cliente', async () => {
      const response = await request('http://localhost:3000')
        .put('/api/clientes/99999')
        .send({ nombre: 'Test' })
        .expect(404)

      expect(response.body).toHaveProperty('error')
    })
  })

  describe('DELETE /api/clientes/[id]', () => {
    test('soft deletes cliente (sets activo to false)', async () => {
      const cliente = createTestCliente()
      const clienteId = await createTestClienteInDb(cliente)

      const response = await request('http://localhost:3000')
        .delete(`/api/clientes/${clienteId}`)
        .expect(200)

      expect(response.body).toMatchObject({
        success: true,
        message: expect.stringContaining('eliminado')
      })

      // Verify cliente is soft deleted
      const getResponse = await request('http://localhost:3000')
        .get(`/api/clientes/${clienteId}`)
        .expect(200)

      expect(getResponse.body.activo).toBe(false)
    })

    test('returns 404 for non-existent cliente', async () => {
      const response = await request('http://localhost:3000')
        .delete('/api/clientes/99999')
        .expect(404)

      expect(response.body).toHaveProperty('error')
    })
  })

  describe('GET /api/clientes/buscar', () => {
    test('searches clientes by multiple criteria', async () => {
      const cliente = createTestCliente({
        nombre: 'Carlos',
        apellidos: 'García',
        email: 'carlos.garcia@test.com',
        telefono: '666555444',
        dni: '33333333C'
      })
      await createTestClienteInDb(cliente)

      // Test search by name
      let response = await request('http://localhost:3000')
        .get('/api/clientes/buscar?q=Carlos')
        .expect(200)
      expect(response.body).toHaveLength(1)

      // Test search by email
      response = await request('http://localhost:3000')
        .get('/api/clientes/buscar?q=carlos.garcia@test.com')
        .expect(200)
      expect(response.body).toHaveLength(1)

      // Test search by phone
      response = await request('http://localhost:3000')
        .get('/api/clientes/buscar?q=666555444')
        .expect(200)
      expect(response.body).toHaveLength(1)

      // Test search by DNI
      response = await request('http://localhost:3000')
        .get('/api/clientes/buscar?q=33333333C')
        .expect(200)
      expect(response.body).toHaveLength(1)
    })

    test('returns empty array for no matches', async () => {
      const response = await request('http://localhost:3000')
        .get('/api/clientes/buscar?q=NoExistentClient')
        .expect(200)

      expect(response.body).toEqual([])
    })

    test('handles partial matches', async () => {
      const cliente = createTestCliente({
        nombre: 'Fernando',
        apellidos: 'Martínez'
      })
      await createTestClienteInDb(cliente)

      const response = await request('http://localhost:3000')
        .get('/api/clientes/buscar?q=Fern')
        .expect(200)

      expect(response.body).toHaveLength(1)
      expect(response.body[0].nombre).toBe('Fernando')
    })
  })

  describe('Business Logic Validation', () => {
    test('validates email format', async () => {
      const invalidEmailData = createTestCliente({
        email: 'invalid-email'
      })

      const response = await request('http://localhost:3000')
        .post('/api/clientes')
        .send(invalidEmailData)
        .expect(400)

      expect(response.body).toHaveProperty('error')
      expect(response.body.error).toContain('email')
    })

    test('validates phone number format', async () => {
      const invalidPhoneData = createTestCliente({
        telefono: '123' // Too short
      })

      const response = await request('http://localhost:3000')
        .post('/api/clientes')
        .send(invalidPhoneData)
        .expect(400)

      expect(response.body).toHaveProperty('error')
      expect(response.body.error).toContain('teléfono')
    })

    test('validates DNI format', async () => {
      const invalidDniData = createTestCliente({
        dni: '123456' // Invalid format
      })

      const response = await request('http://localhost:3000')
        .post('/api/clientes')
        .send(invalidDniData)
        .expect(400)

      expect(response.body).toHaveProperty('error')
      expect(response.body.error).toContain('DNI')
    })

    test('handles JSON parsing for complex fields', async () => {
      const clienteData = createTestCliente({
        vehiculosInteres: JSON.stringify(['BMW X5', 'Audi A4']),
        coloresDeseados: JSON.stringify(['Blanco', 'Negro']),
        etiquetas: JSON.stringify(['VIP', 'Urgente'])
      })

      const response = await request('http://localhost:3000')
        .post('/api/clientes')
        .send(clienteData)
        .expect(200)

      expect(response.body.vehiculosInteres).toBe(clienteData.vehiculosInteres)
      expect(response.body.coloresDeseados).toBe(clienteData.coloresDeseados)
      expect(response.body.etiquetas).toBe(clienteData.etiquetas)
    })
  })
})

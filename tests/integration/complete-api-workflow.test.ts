/**
 * @jest-environment node
 *
 * Flujo completo por HTTP contra un servidor real (TEST_BASE_URL) con la DB de
 * test: cliente → vehículos de cada tipo → deal → depósito → notas → búsquedas
 * → errores. Las aserciones siguen el contrato real de las rutas API.
 */
import { api, iniciarSesion } from './sesion'
import { createCliente } from '../fixtures/factories'

const SUFIJO = Date.now().toString().slice(-6)

describe('Complete CRM API Workflow', () => {
  let createdClientId: number
  const createdVehicleIds: number[] = []
  let createdDealId: number
  let createdDepositId: number

  const dni = `${SUFIJO}00A`
  const email = `test-api-${SUFIJO}@example.com`

  beforeAll(async () => {
    await iniciarSesion()
  })

  describe('1. Cliente', () => {
    test('crea un cliente', async () => {
      const clientData = createCliente({
        nombre: 'Test Cliente API',
        apellidos: 'Apellidos Test',
        telefono: '666111222',
        email,
        dni,
      })

      const response = await api
        .post('/api/clientes')
        .send(clientData)
        .expect(201)

      expect(response.body).toHaveProperty('id')
      expect(response.body.nombre).toBe(clientData.nombre)
      expect(response.body.email).toBe(email)
      createdClientId = response.body.id
    })

    test('lo devuelve por id', async () => {
      const response = await api
        .get(`/api/clientes/${createdClientId}`)
        .expect(200)
      expect(response.body.id).toBe(createdClientId)
      expect(response.body.nombre).toBe('Test Cliente API')
    })

    test('lo encuentra por DNI', async () => {
      const response = await api
        .get('/api/clientes/buscar')
        .query({ q: dni })
        .expect(200)
      expect(response.body).toHaveLength(1)
      expect(response.body[0].dni).toBe(dni)
    })
  })

  describe('2. Vehículos de todos los tipos', () => {
    // El tipo I no se puede dar de alta sin inversor asignado.
    let inversorId: number
    beforeAll(async () => {
      const res = await api
        .post('/api/inversores')
        .send({ nombre: `Inversor test ${SUFIJO}` })
        .expect(201)
      inversorId = res.body.id
    })

    // referencia según normalizarReferencia: serie numérica (#1xxx) para C e I,
    // #D-nn / #R-nn para depósito y renting. Matrícula formato actual 1234BCD.
    const n = Number(SUFIJO.slice(-3)) || 1
    const tipos = [
      {
        tipo: 'C',
        name: 'Compra',
        referencia: `${1000 + n}`,
        refCanon: `#${1000 + n}`,
      },
      {
        tipo: 'I',
        name: 'Inversor',
        referencia: `${2000 + n}`,
        refCanon: `#${2000 + n}`,
      },
      {
        tipo: 'D',
        name: 'Depósito',
        referencia: `D-${n}`,
        refCanon: `#D-${String(n).padStart(2, '0')}`,
      },
      {
        tipo: 'R',
        name: 'Renting',
        referencia: `R-${n}`,
        refCanon: `#R-${String(n).padStart(2, '0')}`,
      },
    ]

    tipos.forEach(({ tipo, name, referencia, refCanon }, i) => {
      test(`crea un vehículo ${name} (tipo ${tipo})`, async () => {
        const response = await api
          .post('/api/vehiculos')
          .send({
            referencia,
            marca: 'Test Marca',
            modelo: `Test Modelo ${tipo}`,
            tipo,
            matricula: `${String(1000 + n + i).slice(-4)}BC${'DFGH'[i]}`,
            bastidor: `WBATEST${SUFIJO}${i}`.padEnd(17, 'X').slice(0, 17),
            kms: 50000,
            fechaMatriculacion: '2020-01-15',
            // Obligatorios del alta (src/lib/camposVehiculo.ts). El de tipo D
            // usa el mismo campo: ahí es el precio acordado con el cliente.
            fechaCompra: '2026-01-15',
            proveedor: 'Proveedor de prueba',
            precioCompra: 9500,
            // El tipo I exige inversor asignado (faltantesAlta)
            ...(tipo === 'I' ? { inversorId: inversorId! } : {}),
          })
          .expect(200)

        expect(response.body.success).toBe(true)
        expect(response.body.vehiculo).toHaveProperty('id')
        expect(response.body.vehiculo.tipo).toBe(tipo)
        expect(response.body.vehiculo.referencia).toBe(refCanon)
        createdVehicleIds.push(response.body.vehiculo.id)
      })
    })

    test('lista con filtro de tipo', async () => {
      const response = await api
        .get('/api/vehiculos')
        .query({ tipo: 'C', limit: 100 })
        .expect(200)
      expect(Array.isArray(response.body.vehiculos)).toBe(true)
      expect(
        response.body.vehiculos.some(
          (v: { id: number }) => v.id === createdVehicleIds[0]
        )
      ).toBe(true)
    })

    test('devuelve estadísticas', async () => {
      const response = await api.get('/api/vehiculos/stats').expect(200)
      expect(response.body).toHaveProperty('totalActivos')
      expect(response.body).toHaveProperty('enProceso')
      expect(response.body.totalActivos).toBeGreaterThan(0)
    })

    test('el kanban cambia el estado y el orden', async () => {
      const vehicleId = createdVehicleIds[0]
      await api
        .put('/api/vehiculos/kanban')
        .send({ updates: [{ id: vehicleId, estado: 'MECAUTO', orden: 1 }] })
        .expect(200)

      const response = await api.get(`/api/vehiculos/${vehicleId}`).expect(200)
      expect(response.body.estado).toBe('MECAUTO')
      expect(response.body.orden).toBe(1)
    })
  })

  describe('3. Deal', () => {
    test('crea un deal para el cliente y el coche de compra', async () => {
      const response = await api
        .post('/api/deals')
        .send({
          clienteId: createdClientId,
          vehiculoId: createdVehicleIds[0],
          importeTotal: 25000,
          importeSena: 1000,
          formaPagoSena: 'transferencia',
        })
        .expect(201)

      expect(response.body).toHaveProperty('id')
      expect(response.body.clienteId).toBe(createdClientId)
      expect(response.body.vehiculoId).toBe(createdVehicleIds[0])
      createdDealId = response.body.id
    })

    test('lo devuelve con cliente y vehículo', async () => {
      const response = await api.get(`/api/deals/${createdDealId}`).expect(200)
      expect(response.body.id).toBe(createdDealId)
      expect(response.body.cliente.id).toBe(createdClientId)
      expect(response.body.vehiculo.id).toBe(createdVehicleIds[0])
    })

    test('pasa a reservado', async () => {
      const response = await api
        .put(`/api/deals/${createdDealId}`)
        .send({ estado: 'reservado' })
        .expect(200)
      expect(response.body.estado).toBe('reservado')
    })

    test('aparece en las últimas operaciones', async () => {
      const response = await api.get('/api/deals/ultimas').expect(200)
      expect(Array.isArray(response.body)).toBe(true)
    })
  })

  describe('4. Depósito', () => {
    test('crea un depósito con el coche de depósito', async () => {
      const response = await api
        .post('/api/depositos')
        .send({
          cliente_id: createdClientId,
          vehiculo_id: createdVehicleIds[2],
          monto_recibir: 18000,
          dias_gestion: 90,
          multa_retiro_anticipado: 500,
          numero_cuenta: 'ES1234567890123456789012',
        })
        .expect(201)

      expect(response.body).toHaveProperty('id')
      expect(response.body.cliente_id).toBe(createdClientId)
      expect(response.body.vehiculo_id).toBe(createdVehicleIds[2])
      createdDepositId = response.body.id
    })

    test('lo devuelve con cliente y vehículo', async () => {
      const response = await api
        .get(`/api/depositos/${createdDepositId}`)
        .expect(200)
      expect(response.body.id).toBe(createdDepositId)
      expect(response.body.cliente.id).toBe(createdClientId)
      expect(response.body.vehiculo.id).toBe(createdVehicleIds[2])
    })

    test('pasa a ACTIVO', async () => {
      const response = await api
        .put(`/api/depositos/${createdDepositId}`)
        .send({ estado: 'ACTIVO' })
        .expect(200)
      expect(response.body.estado).toBe('ACTIVO')
    })

    test('devuelve estadísticas', async () => {
      const response = await api.get('/api/depositos/stats').expect(200)
      expect(response.body).toHaveProperty('totalDepositos')
    })

    test('añade y lista notas', async () => {
      const nota = await api
        .post(`/api/depositos/${createdDepositId}/notas`)
        .send({
          contenido: 'Nota de prueba API',
          usuario: 'Test User',
          tipo: 'general',
        })
        .expect(201)
      expect(nota.body.contenido).toBe('Nota de prueba API')

      const lista = await api
        .get(`/api/depositos/${createdDepositId}/notas`)
        .expect(200)
      expect(Array.isArray(lista.body)).toBe(true)
      expect(lista.body.length).toBeGreaterThan(0)
    })
  })

  describe('5. Búsquedas y filtros', () => {
    test('busca el cliente por nombre, DNI y email', async () => {
      for (const term of ['Test Cliente API', dni, email]) {
        const response = await api
          .get('/api/clientes/buscar')
          .query({ q: term })
          .expect(200)
        expect(response.body.length).toBeGreaterThan(0)
      }
    })

    test('filtra vehículos por tipo y búsqueda', async () => {
      for (const filter of [{ tipo: 'C' }, { search: 'Test Marca' }]) {
        const response = await api
          .get('/api/vehiculos')
          .query(filter)
          .expect(200)
        expect(Array.isArray(response.body.vehiculos)).toBe(true)
      }
    })
  })

  describe('6. Errores', () => {
    test('cliente inexistente → 404', async () => {
      await api.get('/api/clientes/99999999').expect(404)
    })

    test('vehículo inexistente → 404', async () => {
      await api.get('/api/vehiculos/99999999').expect(404)
    })

    test('cliente sin campos obligatorios → 400', async () => {
      await api.post('/api/clientes').send({ nombre: 'Only Name' }).expect(400)
    })

    test('sin sesión → 401', async () => {
      const { default: request } = await import('supertest')
      await request(process.env.TEST_BASE_URL || 'http://localhost:3000')
        .get('/api/clientes')
        .expect(401)
    })
  })
})

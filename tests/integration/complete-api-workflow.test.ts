import request from 'supertest'
import { createCliente, createVehiculo, createDeal, createDeposito } from '../fixtures/factories'

// Mock del servidor Next.js para testing
const baseUrl = process.env.TEST_BASE_URL || 'http://localhost:3000'

describe('Complete CRM API Workflow', () => {
  let createdClientId: number
  let createdVehicleIds: number[] = []
  let createdDealId: number
  let createdDepositId: number

  beforeAll(async () => {
    console.log('🚀 Iniciando tests de integración API completos...')
  })

  afterAll(async () => {
    console.log('🧹 Limpiando datos de prueba...')
    // Aquí podrías agregar lógica de limpieza si es necesario
  })

  describe('1. 🧑‍💼 Cliente Management', () => {
    test('should create a new client', async () => {
      console.log('📝 Creando cliente...')
      
      const clientData = createCliente({
        nombre: 'Test Cliente API',
        apellidos: 'Apellidos Test',
        telefono: '666111222',
        email: 'test-api@example.com',
        dni: '11223344A'
      })

      const response = await request(baseUrl)
        .post('/api/clientes')
        .send(clientData)
        .expect(201)

      expect(response.body).toHaveProperty('id')
      expect(response.body.nombre).toBe(clientData.nombre)
      expect(response.body.email).toBe(clientData.email)
      
      createdClientId = response.body.id
      console.log(`✅ Cliente creado con ID: ${createdClientId}`)
    })

    test('should get client by ID', async () => {
      const response = await request(baseUrl)
        .get(`/api/clientes/${createdClientId}`)
        .expect(200)

      expect(response.body.id).toBe(createdClientId)
      expect(response.body.nombre).toBe('Test Cliente API')
    })

    test('should search clients', async () => {
      const response = await request(baseUrl)
        .get('/api/clientes/buscar')
        .query({ q: '11223344A' })
        .expect(200)

      expect(response.body).toHaveLength(1)
      expect(response.body[0].dni).toBe('11223344A')
    })
  })

  describe('2. 🚗 Vehicle Management - All Types', () => {
    const vehicleTypes = [
      { tipo: 'C', name: 'Compra', referencia: 'API001' },
      { tipo: 'I', name: 'Inversor', referencia: 'API002' },
      { tipo: 'D', name: 'Depósito', referencia: 'API003' },
      { tipo: 'R', name: 'Renting', referencia: 'API004' }
    ]

    vehicleTypes.forEach(({ tipo, name, referencia }) => {
      test(`should create ${name} vehicle (tipo: ${tipo})`, async () => {
        console.log(`🚙 Creando vehículo tipo ${tipo} (${name})...`)
        
        const vehicleData = createVehiculo({
          referencia,
          marca: 'Test Marca',
          modelo: `Test Modelo ${tipo}`,
          tipo,
          matricula: `${referencia}ABC`,
          bastidor: `WBA${referencia}123456789`,
          kms: 50000,
          fechaMatriculacion: '2020-01-15'
        })

        const response = await request(baseUrl)
          .post('/api/vehiculos')
          .send(vehicleData)
          .expect(201)

        expect(response.body).toHaveProperty('id')
        expect(response.body.tipo).toBe(tipo)
        expect(response.body.referencia).toBe(referencia)
        
        createdVehicleIds.push(response.body.id)
        console.log(`✅ Vehículo ${name} creado con ID: ${response.body.id}`)
      })
    })

    test('should get vehicles with filters', async () => {
      const response = await request(baseUrl)
        .get('/api/vehiculos')
        .query({ tipo: 'C' })
        .expect(200)

      expect(response.body.vehiculos).toBeDefined()
      const compraVehicles = response.body.vehiculos.filter((v: any) => v.tipo === 'C')
      expect(compraVehicles.length).toBeGreaterThan(0)
    })

    test('should get kanban data', async () => {
      const response = await request(baseUrl)
        .get('/api/vehiculos/kanban')
        .expect(200)

      expect(response.body).toHaveProperty('columns')
      expect(Array.isArray(response.body.columns)).toBe(true)
    })

    test('should get vehicle stats', async () => {
      const response = await request(baseUrl)
        .get('/api/vehiculos/stats')
        .expect(200)

      expect(response.body).toHaveProperty('total')
      expect(response.body).toHaveProperty('porTipo')
    })
  })

  describe('3. 🤝 Deal Management', () => {
    test('should create a deal', async () => {
      console.log('📋 Creando deal...')
      
      // Buscar vehículo de compra creado
      const compraVehicle = createdVehicleIds[0]
      
      const dealData = createDeal({
        cliente_id: createdClientId,
        vehiculo_id: compraVehicle,
        precio: 25000,
        estado: 'reserva'
      })

      const response = await request(baseUrl)
        .post('/api/deals')
        .send(dealData)
        .expect(201)

      expect(response.body).toHaveProperty('id')
      expect(response.body.cliente_id).toBe(createdClientId)
      expect(response.body.vehiculo_id).toBe(compraVehicle)
      
      createdDealId = response.body.id
      console.log(`✅ Deal creado con ID: ${createdDealId}`)
    })

    test('should get deal by ID', async () => {
      const response = await request(baseUrl)
        .get(`/api/deals/${createdDealId}`)
        .expect(200)

      expect(response.body.id).toBe(createdDealId)
      expect(response.body).toHaveProperty('cliente')
      expect(response.body).toHaveProperty('vehiculo')
    })

    test('should update deal estado', async () => {
      const response = await request(baseUrl)
        .put(`/api/deals/${createdDealId}`)
        .send({ estado: 'venta' })
        .expect(200)

      expect(response.body.estado).toBe('venta')
    })

    test('should get latest deals', async () => {
      const response = await request(baseUrl)
        .get('/api/deals/ultimas')
        .expect(200)

      expect(Array.isArray(response.body)).toBe(true)
    })
  })

  describe('4. 📦 Deposit Management', () => {
    test('should create a deposit', async () => {
      console.log('📦 Creando depósito...')
      
      // Buscar vehículo de depósito creado
      const depositVehicle = createdVehicleIds[2] // Tipo D
      
      const depositData = createDeposito({
        cliente_id: createdClientId,
        vehiculo_id: depositVehicle,
        monto_recibir: 18000,
        dias_gestion: 90,
        multa_retiro_anticipado: 500,
        numero_cuenta: 'ES1234567890123456789012'
      })

      const response = await request(baseUrl)
        .post('/api/depositos')
        .send(depositData)
        .expect(201)

      expect(response.body).toHaveProperty('id')
      expect(response.body.cliente_id).toBe(createdClientId)
      expect(response.body.vehiculo_id).toBe(depositVehicle)
      
      createdDepositId = response.body.id
      console.log(`✅ Depósito creado con ID: ${createdDepositId}`)
    })

    test('should get deposit by ID', async () => {
      const response = await request(baseUrl)
        .get(`/api/depositos/${createdDepositId}`)
        .expect(200)

      expect(response.body.id).toBe(createdDepositId)
      expect(response.body).toHaveProperty('cliente')
      expect(response.body).toHaveProperty('vehiculo')
    })

    test('should update deposit estado', async () => {
      const response = await request(baseUrl)
        .put(`/api/depositos/${createdDepositId}`)
        .send({ estado: 'activo' })
        .expect(200)

      expect(response.body.estado).toBe('activo')
    })

    test('should get deposit stats', async () => {
      const response = await request(baseUrl)
        .get('/api/depositos/stats')
        .expect(200)

      expect(response.body).toHaveProperty('total')
      expect(response.body).toHaveProperty('activos')
    })

    test('should add note to deposit', async () => {
      const noteData = {
        contenido: 'Nota de prueba API',
        usuario: 'Test User',
        tipo: 'general'
      }

      const response = await request(baseUrl)
        .post(`/api/depositos/${createdDepositId}/notas`)
        .send(noteData)
        .expect(201)

      expect(response.body).toHaveProperty('id')
      expect(response.body.contenido).toBe(noteData.contenido)
    })

    test('should get deposit notes', async () => {
      const response = await request(baseUrl)
        .get(`/api/depositos/${createdDepositId}/notas`)
        .expect(200)

      expect(Array.isArray(response.body)).toBe(true)
      expect(response.body.length).toBeGreaterThan(0)
    })
  })

  describe('5. 🔄 Kanban State Changes', () => {
    test('should update vehicle estado in kanban', async () => {
      if (createdVehicleIds.length > 0) {
        const vehicleId = createdVehicleIds[0]
        
        const response = await request(baseUrl)
          .put(`/api/vehiculos/${vehicleId}`)
          .send({ estado: 'mecánica', orden: 1 })
          .expect(200)

        expect(response.body.estado).toBe('mecánica')
        console.log(`✅ Vehículo ${vehicleId} movido a estado 'mecánica'`)
      }
    })

    test('should verify kanban reflects estado changes', async () => {
      const response = await request(baseUrl)
        .get('/api/vehiculos/kanban')
        .expect(200)

      const mecanicaColumn = response.body.columns.find((col: any) => col.id === 'mecánica')
      expect(mecanicaColumn).toBeDefined()
      expect(mecanicaColumn.vehicles.length).toBeGreaterThan(0)
    })
  })

  describe('6. 📊 Dashboard Data', () => {
    test('should get complete dashboard data', async () => {
      const endpoints = [
        '/api/vehiculos/stats',
        '/api/depositos/stats',
        '/api/deals/ultimas'
      ]

      for (const endpoint of endpoints) {
        console.log(`📊 Testing endpoint: ${endpoint}`)
        
        const response = await request(baseUrl)
          .get(endpoint)
          .expect(200)

        expect(response.body).toBeDefined()
        console.log(`✅ ${endpoint} responded correctly`)
      }
    })
  })

  describe('7. 🔍 Search and Filter Tests', () => {
    test('should search clients by different criteria', async () => {
      const searchTerms = ['Test Cliente API', '11223344A', 'test-api@example.com']
      
      for (const term of searchTerms) {
        const response = await request(baseUrl)
          .get('/api/clientes/buscar')
          .query({ q: term })
          .expect(200)

        expect(response.body.length).toBeGreaterThan(0)
        console.log(`✅ Client search by "${term}" successful`)
      }
    })

    test('should filter vehicles by multiple criteria', async () => {
      const filters = [
        { tipo: 'C' },
        { estado: 'disponible' },
        { marca: 'Test Marca' }
      ]
      
      for (const filter of filters) {
        const response = await request(baseUrl)
          .get('/api/vehiculos')
          .query(filter)
          .expect(200)

        expect(response.body.vehiculos).toBeDefined()
        console.log(`✅ Vehicle filter ${JSON.stringify(filter)} successful`)
      }
    })
  })

  describe('8. 🧪 Error Handling', () => {
    test('should handle invalid client ID', async () => {
      await request(baseUrl)
        .get('/api/clientes/99999')
        .expect(404)
    })

    test('should handle invalid vehicle ID', async () => {
      await request(baseUrl)
        .get('/api/vehiculos/99999')
        .expect(404)
    })

    test('should validate required fields on creation', async () => {
      await request(baseUrl)
        .post('/api/clientes')
        .send({ nombre: 'Only Name' }) // Missing required fields
        .expect(400)
    })
  })
})

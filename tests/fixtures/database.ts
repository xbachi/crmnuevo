import { Pool } from 'pg'
import {
  TestCliente,
  TestVehiculo,
  TestDeal,
  TestDeposito,
  TestInversor,
} from './factories'

// Test database configuration
const testDbConfig = {
  user: process.env.TEST_DB_USER || 'postgres',
  host: process.env.TEST_DB_HOST || 'localhost',
  database: process.env.TEST_DB_NAME || 'crm_test',
  password: process.env.TEST_DB_PASSWORD || 'postgres',
  port: parseInt(process.env.TEST_DB_PORT || '5432'),
}

let testPool: Pool | null = null

export const getTestDb = (): Pool => {
  if (!testPool) {
    testPool = new Pool(testDbConfig)
  }
  return testPool
}

export const closeTestDb = async (): Promise<void> => {
  if (testPool) {
    await testPool.end()
    testPool = null
  }
}

// Database cleanup functions
export const cleanupDatabase = async (): Promise<void> => {
  const pool = getTestDb()
  
  try {
    // Delete in order to respect foreign key constraints
    await pool.query('DELETE FROM "NotaDeposito"')
    await pool.query('DELETE FROM depositos')
    await pool.query('DELETE FROM "Deal"')
    await pool.query('DELETE FROM "NotaCliente"')
    await pool.query('DELETE FROM "Vehiculo"')
    await pool.query('DELETE FROM "Inversor"')
    await pool.query('DELETE FROM "Cliente"')
    
    // Reset sequences
    await pool.query('ALTER SEQUENCE "Cliente_id_seq" RESTART WITH 1')
    await pool.query('ALTER SEQUENCE "Vehiculo_id_seq" RESTART WITH 1')
    await pool.query('ALTER SEQUENCE "Deal_id_seq" RESTART WITH 1')
    await pool.query('ALTER SEQUENCE "Inversor_id_seq" RESTART WITH 1')
    await pool.query('ALTER SEQUENCE depositos_id_seq RESTART WITH 1')
    await pool.query('ALTER SEQUENCE "NotaCliente_id_seq" RESTART WITH 1')
    await pool.query('ALTER SEQUENCE "NotaDeposito_id_seq" RESTART WITH 1')
  } catch (error) {
    console.error('Error cleaning database:', error)
    throw error
  }
}

// Create test data functions
export const createTestClienteInDb = async (cliente: TestCliente): Promise<number> => {
  const pool = getTestDb()
  
  const query = `
    INSERT INTO "Cliente" (
      nombre, apellidos, email, telefono, dni, direccion, ciudad, provincia, "codigoPostal",
      "fechaNacimiento", "vehiculosInteres", "presupuestoMaximo", "kilometrajeMaximo", 
      "añoMinimo", "combustiblePreferido", "cambioPreferido", "coloresDeseados",
      "necesidadesEspeciales", "formaPagoPreferida", "comoLlego", estado, prioridad,
      "proximoPaso", etiquetas, "notasAdicionales", observaciones, activo
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26, $27)
    RETURNING id
  `
  
  const values = [
    cliente.nombre,
    cliente.apellidos,
    cliente.email,
    cliente.telefono,
    cliente.dni,
    cliente.direccion,
    cliente.ciudad,
    cliente.provincia,
    cliente.codigoPostal,
    cliente.fechaNacimiento,
    cliente.vehiculosInteres,
    cliente.presupuestoMaximo,
    cliente.kilometrajeMaximo,
    cliente.añoMinimo,
    cliente.combustiblePreferido,
    cliente.cambioPreferido,
    cliente.coloresDeseados,
    cliente.necesidadesEspeciales,
    cliente.formaPagoPreferida,
    cliente.comoLlego,
    cliente.estado,
    cliente.prioridad,
    cliente.proximoPaso,
    cliente.etiquetas,
    cliente.notasAdicionales,
    cliente.observaciones,
    cliente.activo,
  ]
  
  const result = await pool.query(query, values)
  return result.rows[0].id
}

export const createTestVehiculoInDb = async (vehiculo: TestVehiculo): Promise<number> => {
  const pool = getTestDb()
  
  const query = `
    INSERT INTO "Vehiculo" (
      referencia, marca, modelo, matricula, bastidor, kms, tipo, estado, orden,
      "fechaMatriculacion", año, itv, seguro, "segundaLlave", documentacion,
      carpeta, master, "hojasA", "esCocheInversor", "inversorId", "fechaCompra",
      "precioCompra", "gastosTransporte", "gastosTasas", "gastosMecanica",
      "gastosPintura", "gastosLimpieza", "gastosOtros", "precioPublicacion",
      "precioVenta", "beneficioNeto", "notasInversor", "fotoInversor", "dealActivoId"
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26, $27, $28, $29, $30, $31, $32, $33, $34)
    RETURNING id
  `
  
  const values = [
    vehiculo.referencia,
    vehiculo.marca,
    vehiculo.modelo,
    vehiculo.matricula,
    vehiculo.bastidor,
    vehiculo.kms,
    vehiculo.tipo,
    vehiculo.estado,
    vehiculo.orden,
    vehiculo.fechaMatriculacion,
    vehiculo.año,
    vehiculo.itv,
    vehiculo.seguro,
    vehiculo.segundaLlave,
    vehiculo.documentacion,
    vehiculo.carpeta,
    vehiculo.master,
    vehiculo.hojasA,
    vehiculo.esCocheInversor,
    vehiculo.inversorId,
    vehiculo.fechaCompra,
    vehiculo.precioCompra,
    vehiculo.gastosTransporte,
    vehiculo.gastosTasas,
    vehiculo.gastosMecanica,
    vehiculo.gastosPintura,
    vehiculo.gastosLimpieza,
    vehiculo.gastosOtros,
    vehiculo.precioPublicacion,
    vehiculo.precioVenta,
    vehiculo.beneficioNeto,
    vehiculo.notasInversor,
    vehiculo.fotoInversor,
    vehiculo.dealActivoId,
  ]
  
  const result = await pool.query(query, values)
  return result.rows[0].id
}

export const createTestDealInDb = async (deal: TestDeal): Promise<number> => {
  const pool = getTestDb()
  
  const query = `
    INSERT INTO "Deal" (
      numero, "clienteId", "vehiculoId", estado, resultado, motivo,
      "importeTotal", "importeSena", "formaPagoSena", "restoAPagar",
      financiacion, "entidadFinanciera", "fechaCreacion", "fechaReservaDesde",
      "fechaReservaExpira", "fechaVentaFirmada", "fechaFacturada", "fechaEntrega",
      "contratoReserva", "contratoVenta", factura, recibos, "pagosSena",
      "pagosResto", observaciones, "responsableComercial", "cambioNombreSolicitado",
      "documentacionRecibida", "clienteAvisado", "documentacionRetirada", "logHistorial"
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26, $27, $28, $29, $30, $31)
    RETURNING id
  `
  
  const values = [
    deal.numero,
    deal.clienteId,
    deal.vehiculoId,
    deal.estado,
    deal.resultado,
    deal.motivo,
    deal.importeTotal,
    deal.importeSena,
    deal.formaPagoSena,
    deal.restoAPagar,
    deal.financiacion,
    deal.entidadFinanciera,
    deal.fechaCreacion,
    deal.fechaReservaDesde,
    deal.fechaReservaExpira,
    deal.fechaVentaFirmada,
    deal.fechaFacturada,
    deal.fechaEntrega,
    deal.contratoReserva,
    deal.contratoVenta,
    deal.factura,
    deal.recibos,
    deal.pagosSena,
    deal.pagosResto,
    deal.observaciones,
    deal.responsableComercial,
    deal.cambioNombreSolicitado,
    deal.documentacionRecibida,
    deal.clienteAvisado,
    deal.documentacionRetirada,
    deal.logHistorial,
  ]
  
  const result = await pool.query(query, values)
  return result.rows[0].id
}

export const createTestDepositoInDb = async (deposito: TestDeposito): Promise<number> => {
  const pool = getTestDb()
  
  const query = `
    INSERT INTO depositos (
      cliente_id, vehiculo_id, estado, monto_recibir, dias_gestion,
      multa_retiro_anticipado, numero_cuenta, fecha_inicio, fecha_fin,
      contrato_deposito, contrato_compra, precio_venta, comision_porcentaje,
      notas, created_at, updated_at
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
    RETURNING id
  `
  
  const values = [
    deposito.cliente_id,
    deposito.vehiculo_id,
    deposito.estado,
    deposito.monto_recibir,
    deposito.dias_gestion,
    deposito.multa_retiro_anticipado,
    deposito.numero_cuenta,
    deposito.fecha_inicio,
    deposito.fecha_fin,
    deposito.contrato_deposito,
    deposito.contrato_compra,
    deposito.precio_venta,
    deposito.comision_porcentaje,
    deposito.notas,
    deposito.created_at,
    deposito.updated_at,
  ]
  
  const result = await pool.query(query, values)
  return result.rows[0].id
}

export const createTestInversorInDb = async (inversor: TestInversor): Promise<number> => {
  const pool = getTestDb()
  
  const query = `
    INSERT INTO "Inversor" (
      nombre, email, telefono, "capitalAportado", "capitalInvertido", activo
    ) VALUES ($1, $2, $3, $4, $5, $6)
    RETURNING id
  `
  
  const values = [
    inversor.nombre,
    inversor.email,
    inversor.telefono,
    inversor.capitalAportado,
    inversor.capitalInvertido,
    inversor.activo,
  ]
  
  const result = await pool.query(query, values)
  return result.rows[0].id
}

// Helper functions for complex test scenarios
export const createCompleteDepositScenario = async (): Promise<{
  clienteId: number
  vehiculoId: number
  depositoId: number
}> => {
  const { createTestCliente, createVehiculoDeposito, createTestDeposito } = await import('./factories')
  
  // Create cliente with mandatory address fields for deposits
  const cliente = createTestCliente({
    direccion: 'Calle Test 123',
    ciudad: 'Valencia',
    provincia: 'Valencia',
    codigoPostal: '46001',
  })
  const clienteId = await createTestClienteInDb(cliente)
  
  // Create deposit vehicle
  const vehiculo = createVehiculoDeposito()
  const vehiculoId = await createTestVehiculoInDb(vehiculo)
  
  // Create deposit
  const deposito = createTestDeposito({
    cliente_id: clienteId,
    vehiculo_id: vehiculoId,
  })
  const depositoId = await createTestDepositoInDb(deposito)
  
  return { clienteId, vehiculoId, depositoId }
}

export const createCompleteDealScenario = async (): Promise<{
  clienteId: number
  vehiculoId: number
  dealId: number
}> => {
  const { createTestCliente, createVehiculoCompra, createTestDeal } = await import('./factories')
  
  // Create cliente
  const cliente = createTestCliente()
  const clienteId = await createTestClienteInDb(cliente)
  
  // Create vehicle
  const vehiculo = createVehiculoCompra()
  const vehiculoId = await createTestVehiculoInDb(vehiculo)
  
  // Create deal
  const deal = createTestDeal({
    clienteId,
    vehiculoId,
  })
  const dealId = await createTestDealInDb(deal)
  
  return { clienteId, vehiculoId, dealId }
}

export const createInvestorScenario = async (): Promise<{
  inversorId: number
  vehiculoId: number
}> => {
  const { createTestInversor, createVehiculoInversor } = await import('./factories')
  
  // Create investor
  const inversor = createTestInversor()
  const inversorId = await createTestInversorInDb(inversor)
  
  // Create investor vehicle
  const vehiculo = createVehiculoInversor({
    inversorId,
  })
  const vehiculoId = await createTestVehiculoInDb(vehiculo)
  
  return { inversorId, vehiculoId }
}

// Database state verification functions
export const verifyDatabaseIntegrity = async (): Promise<boolean> => {
  const pool = getTestDb()
  
  try {
    // Check foreign key relationships
    const dealResult = await pool.query(`
      SELECT COUNT(*) as count 
      FROM "Deal" d 
      LEFT JOIN "Cliente" c ON d."clienteId" = c.id 
      LEFT JOIN "Vehiculo" v ON d."vehiculoId" = v.id 
      WHERE c.id IS NULL OR v.id IS NULL
    `)
    
    const depositoResult = await pool.query(`
      SELECT COUNT(*) as count 
      FROM depositos d 
      LEFT JOIN "Cliente" c ON d.cliente_id = c.id 
      LEFT JOIN "Vehiculo" v ON d.vehiculo_id = v.id 
      WHERE c.id IS NULL OR v.id IS NULL
    `)
    
    const vehiculoResult = await pool.query(`
      SELECT COUNT(*) as count 
      FROM "Vehiculo" v 
      LEFT JOIN "Inversor" i ON v."inversorId" = i.id 
      WHERE v."esCocheInversor" = true AND i.id IS NULL
    `)
    
    return (
      parseInt(dealResult.rows[0].count) === 0 &&
      parseInt(depositoResult.rows[0].count) === 0 &&
      parseInt(vehiculoResult.rows[0].count) === 0
    )
  } catch (error) {
    console.error('Database integrity check failed:', error)
    return false
  }
}

// Test database initialization
export const initializeTestDatabase = async (): Promise<void> => {
  const pool = getTestDb()
  
  try {
    // Test connection
    await pool.query('SELECT NOW()')
    console.log('Test database connection established')
    
    // Clean database
    await cleanupDatabase()
    console.log('Test database cleaned')
    
    // Verify integrity
    const isIntegral = await verifyDatabaseIntegrity()
    if (!isIntegral) {
      throw new Error('Database integrity check failed after cleanup')
    }
    
    console.log('Test database initialized successfully')
  } catch (error) {
    console.error('Failed to initialize test database:', error)
    throw error
  }
}

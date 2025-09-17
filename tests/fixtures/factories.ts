import { faker } from '@faker-js/faker'

// Types for our test data
export interface TestCliente {
  id?: number
  nombre: string
  apellidos: string
  email?: string
  telefono?: string
  dni?: string
  direccion?: string
  ciudad?: string
  provincia?: string
  codigoPostal?: string
  fechaNacimiento?: Date
  vehiculosInteres?: string
  presupuestoMaximo?: number
  kilometrajeMaximo?: number
  añoMinimo?: number
  combustiblePreferido?: string
  cambioPreferido?: string
  coloresDeseados?: string
  necesidadesEspeciales?: string
  formaPagoPreferida?: string
  comoLlego?: string
  estado?: string
  prioridad?: string
  proximoPaso?: string
  etiquetas?: string
  notasAdicionales?: string
  observaciones?: string
  activo?: boolean
}

export interface TestVehiculo {
  id?: number
  referencia: string
  marca: string
  modelo: string
  matricula: string
  bastidor: string
  kms: number
  tipo: string
  estado?: string
  orden?: number
  fechaMatriculacion?: string
  año?: number
  itv?: string
  seguro?: string
  segundaLlave?: string
  documentacion?: string
  carpeta?: string
  master?: string
  hojasA?: string
  esCocheInversor?: boolean
  inversorId?: number
  fechaCompra?: Date
  precioCompra?: number
  gastosTransporte?: number
  gastosTasas?: number
  gastosMecanica?: number
  gastosPintura?: number
  gastosLimpieza?: number
  gastosOtros?: number
  precioPublicacion?: number
  precioVenta?: number
  beneficioNeto?: number
  notasInversor?: string
  fotoInversor?: string
  dealActivoId?: number
}

export interface TestDeal {
  id?: number
  numero: string
  clienteId: number
  vehiculoId: number
  estado?: string
  resultado?: string
  motivo?: string
  importeTotal?: number
  importeSena?: number
  formaPagoSena?: string
  restoAPagar?: number
  financiacion?: boolean
  entidadFinanciera?: string
  fechaCreacion?: Date
  fechaReservaDesde?: Date
  fechaReservaExpira?: Date
  fechaVentaFirmada?: Date
  fechaFacturada?: Date
  fechaEntrega?: Date
  contratoReserva?: string
  contratoVenta?: string
  factura?: string
  recibos?: string
  pagosSena?: string
  pagosResto?: string
  observaciones?: string
  responsableComercial?: string
  cambioNombreSolicitado?: boolean
  documentacionRecibida?: boolean
  clienteAvisado?: boolean
  documentacionRetirada?: boolean
  logHistorial?: string
}

export interface TestDeposito {
  id?: number
  cliente_id: number
  vehiculo_id: number
  estado?: string
  monto_recibir?: number
  dias_gestion?: number
  multa_retiro_anticipado?: number
  numero_cuenta?: string
  fecha_inicio?: Date
  fecha_fin?: Date
  contrato_deposito?: string
  contrato_compra?: string
  precio_venta?: number
  comision_porcentaje?: number
  notas?: string
  created_at?: Date
  updated_at?: Date
}

export interface TestInversor {
  id?: number
  nombre: string
  email?: string
  telefono?: string
  capitalAportado?: number
  capitalInvertido?: number
  activo?: boolean
}

// Factory functions
export const createTestCliente = (overrides: Partial<TestCliente> = {}): TestCliente => {
  const nombre = faker.person.firstName()
  const apellidos = faker.person.lastName()
  
  return {
    nombre,
    apellidos,
    email: faker.internet.email({ firstName: nombre, lastName: apellidos }),
    telefono: faker.phone.number('6## ### ###'),
    dni: faker.string.numeric(8) + faker.string.alpha({ length: 1, casing: 'upper' }),
    direccion: faker.location.streetAddress(),
    ciudad: faker.location.city(),
    provincia: faker.location.state(),
    codigoPostal: faker.location.zipCode('####'),
    fechaNacimiento: faker.date.birthdate({ min: 18, max: 80, mode: 'age' }),
    vehiculosInteres: JSON.stringify([faker.vehicle.model(), faker.vehicle.model()]),
    presupuestoMaximo: faker.number.int({ min: 5000, max: 50000 }),
    kilometrajeMaximo: faker.number.int({ min: 50000, max: 200000 }),
    añoMinimo: faker.number.int({ min: 2015, max: 2023 }),
    combustiblePreferido: faker.helpers.arrayElement(['gasolina', 'diesel', 'hibrido', 'electrico', 'cualquiera']),
    cambioPreferido: faker.helpers.arrayElement(['manual', 'automatico', 'cualquiera']),
    coloresDeseados: JSON.stringify([faker.color.human(), faker.color.human()]),
    necesidadesEspeciales: JSON.stringify([faker.lorem.words(3)]),
    formaPagoPreferida: faker.helpers.arrayElement(['efectivo', 'transferencia', 'financiacion', 'cualquiera']),
    comoLlego: faker.helpers.arrayElement(['web', 'telefono', 'recomendacion', 'presencial']),
    estado: 'nuevo',
    prioridad: 'media',
    proximoPaso: faker.lorem.sentence(),
    etiquetas: JSON.stringify([faker.lorem.word(), faker.lorem.word()]),
    notasAdicionales: faker.lorem.paragraph(),
    observaciones: faker.lorem.sentence(),
    activo: true,
    ...overrides,
  }
}

export const createTestVehiculo = (overrides: Partial<TestVehiculo> = {}): TestVehiculo => {
  const marca = faker.vehicle.manufacturer()
  const modelo = faker.vehicle.model()
  const year = faker.number.int({ min: 2015, max: 2024 })
  
  return {
    referencia: faker.string.numeric(4),
    marca,
    modelo,
    matricula: faker.string.numeric(4) + faker.string.alpha({ length: 3, casing: 'upper' }),
    bastidor: faker.string.alphanumeric({ length: 17, casing: 'upper' }),
    kms: faker.number.int({ min: 10000, max: 200000 }),
    tipo: faker.helpers.arrayElement(['C', 'I', 'D', 'R']),
    estado: 'disponible',
    orden: faker.number.int({ min: 0, max: 100 }),
    fechaMatriculacion: `${year}-${faker.date.month()}-${faker.date.recent()}`,
    año: year,
    itv: faker.helpers.arrayElement(['al dia', 'proxima', 'vencida']),
    seguro: faker.helpers.arrayElement(['al dia', 'proximo vencimiento', 'vencido']),
    segundaLlave: faker.helpers.arrayElement(['si', 'no']),
    documentacion: faker.helpers.arrayElement(['completa', 'falta ITV', 'falta seguro']),
    carpeta: faker.string.alphanumeric(10),
    master: faker.helpers.arrayElement(['si', 'no']),
    hojasA: faker.helpers.arrayElement(['si', 'no']),
    esCocheInversor: false,
    precioCompra: faker.number.int({ min: 8000, max: 30000 }),
    gastosTransporte: faker.number.int({ min: 200, max: 800 }),
    gastosTasas: faker.number.int({ min: 300, max: 1000 }),
    gastosMecanica: faker.number.int({ min: 500, max: 3000 }),
    gastosPintura: faker.number.int({ min: 0, max: 2000 }),
    gastosLimpieza: faker.number.int({ min: 100, max: 500 }),
    gastosOtros: faker.number.int({ min: 0, max: 1000 }),
    precioPublicacion: faker.number.int({ min: 12000, max: 40000 }),
    precioVenta: faker.number.int({ min: 12000, max: 40000 }),
    notasInversor: faker.lorem.paragraph(),
    ...overrides,
  }
}

export const createTestDeal = (overrides: Partial<TestDeal> = {}): TestDeal => {
  const year = new Date().getFullYear()
  const number = faker.string.numeric(4)
  
  return {
    numero: `RES-${year}-${number}`,
    clienteId: faker.number.int({ min: 1, max: 100 }),
    vehiculoId: faker.number.int({ min: 1, max: 100 }),
    estado: 'nuevo',
    importeTotal: faker.number.int({ min: 12000, max: 40000 }),
    importeSena: faker.number.int({ min: 1000, max: 5000 }),
    formaPagoSena: faker.helpers.arrayElement(['efectivo', 'transferencia', 'tarjeta']),
    financiacion: faker.datatype.boolean(),
    fechaCreacion: faker.date.recent({ days: 30 }),
    fechaReservaDesde: faker.date.recent({ days: 7 }),
    fechaReservaExpira: faker.date.future({ days: 15 }),
    observaciones: faker.lorem.paragraph(),
    responsableComercial: faker.person.fullName(),
    cambioNombreSolicitado: false,
    documentacionRecibida: false,
    clienteAvisado: false,
    documentacionRetirada: false,
    logHistorial: JSON.stringify([{
      fecha: faker.date.recent(),
      accion: 'Creacion',
      usuario: 'Sistema',
      detalles: 'Deal creado'
    }]),
    ...overrides,
  }
}

export const createTestDeposito = (overrides: Partial<TestDeposito> = {}): TestDeposito => {
  const fechaInicio = faker.date.recent({ days: 30 })
  const diasGestion = faker.number.int({ min: 30, max: 180 })
  const fechaFin = new Date(fechaInicio)
  fechaFin.setDate(fechaFin.getDate() + diasGestion)
  
  return {
    cliente_id: faker.number.int({ min: 1, max: 100 }),
    vehiculo_id: faker.number.int({ min: 1, max: 100 }),
    estado: 'ACTIVO',
    monto_recibir: faker.number.int({ min: 8000, max: 25000 }),
    dias_gestion: diasGestion,
    multa_retiro_anticipado: faker.number.int({ min: 500, max: 2000 }),
    numero_cuenta: faker.finance.accountNumber(),
    fecha_inicio: fechaInicio,
    fecha_fin: fechaFin,
    precio_venta: faker.number.int({ min: 12000, max: 35000 }),
    comision_porcentaje: faker.number.int({ min: 10, max: 25 }),
    notas: faker.lorem.paragraph(),
    created_at: fechaInicio,
    updated_at: faker.date.recent({ days: 7 }),
    ...overrides,
  }
}

export const createTestInversor = (overrides: Partial<TestInversor> = {}): TestInversor => {
  const nombre = faker.person.fullName()
  
  return {
    nombre,
    email: faker.internet.email({ firstName: nombre }),
    telefono: faker.phone.number('6## ### ###'),
    capitalAportado: faker.number.int({ min: 50000, max: 500000 }),
    capitalInvertido: faker.number.int({ min: 30000, max: 300000 }),
    activo: true,
    ...overrides,
  }
}

// Helper functions for specific test scenarios
export const createVehiculoDeposito = (overrides: Partial<TestVehiculo> = {}): TestVehiculo => {
  return createTestVehiculo({
    tipo: 'D',
    referencia: `D-${faker.string.numeric(3)}`,
    ...overrides,
  })
}

export const createVehiculoInversor = (overrides: Partial<TestVehiculo> = {}): TestVehiculo => {
  return createTestVehiculo({
    tipo: 'I',
    referencia: `I-${faker.string.numeric(3)}`,
    esCocheInversor: true,
    inversorId: faker.number.int({ min: 1, max: 10 }),
    ...overrides,
  })
}

export const createVehiculoCompra = (overrides: Partial<TestVehiculo> = {}): TestVehiculo => {
  return createTestVehiculo({
    tipo: 'C',
    referencia: faker.string.numeric(4),
    esCocheInversor: false,
    ...overrides,
  })
}

export const createDealReserva = (overrides: Partial<TestDeal> = {}): TestDeal => {
  const year = new Date().getFullYear()
  const number = faker.string.numeric(4)
  
  return createTestDeal({
    numero: `RES-${year}-${number}`,
    estado: 'reservado',
    fechaReservaDesde: faker.date.recent({ days: 3 }),
    fechaReservaExpira: faker.date.future({ days: 15 }),
    ...overrides,
  })
}

export const createDealVenta = (overrides: Partial<TestDeal> = {}): TestDeal => {
  const year = new Date().getFullYear()
  const number = faker.string.numeric(4)
  
  return createTestDeal({
    numero: `CCV-${year}-${number}`,
    estado: 'vendido',
    fechaVentaFirmada: faker.date.recent({ days: 1 }),
    ...overrides,
  })
}

// Batch creation helpers
export const createTestClientes = (count: number, overrides: Partial<TestCliente> = {}): TestCliente[] => {
  return Array.from({ length: count }, () => createTestCliente(overrides))
}

export const createTestVehiculos = (count: number, overrides: Partial<TestVehiculo> = {}): TestVehiculo[] => {
  return Array.from({ length: count }, () => createTestVehiculo(overrides))
}

export const createTestDeals = (count: number, overrides: Partial<TestDeal> = {}): TestDeal[] => {
  return Array.from({ length: count }, () => createTestDeal(overrides))
}

export const createTestDepositos = (count: number, overrides: Partial<TestDeposito> = {}): TestDeposito[] => {
  return Array.from({ length: count }, () => createTestDeposito(overrides))
}

export const createTestInversores = (count: number, overrides: Partial<TestInversor> = {}): TestInversor[] => {
  return Array.from({ length: count }, () => createTestInversor(overrides))
}

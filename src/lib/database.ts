import { promises as fs } from 'fs'
import path from 'path'

export interface Vehiculo {
  id: number
  referencia: string
  marca: string
  modelo: string
  matricula: string
  bastidor: string
  kms: number
  tipo: string
  estado: string
  orden: number
  createdAt: string
  updatedAt: string
  // Campos adicionales de Google Sheets
  fechaMatriculacion?: string
  año?: number
  itv?: string
  seguro?: string
  segundaLlave?: string
  documentacion?: string
  carpeta?: string
  master?: string
  hojasA?: string
  // Campos de inversor
  esCocheInversor?: boolean
  inversorId?: number
  fechaCompra?: string
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
}

export interface Inversor {
  id: number
  nombre: string
  email?: string
  capitalAportado: number
  fechaAporte: string
  capitalInvertido?: number
  capitalDisponible?: number
  notasInternas?: string
  usuario?: string
  contraseña?: string
  createdAt: string
  updatedAt: string
}

export interface Cliente {
  id: number
  nombre: string
  apellidos: string
  telefono: string
  email?: string
  dni?: string
  whatsapp?: string
  comoLlego: string
  fechaPrimerContacto: string
  estado:
    | 'nuevo'
    | 'en_seguimiento'
    | 'cita_agendada'
    | 'cerrado'
    | 'descartado'
  prioridad: 'alta' | 'media' | 'baja'
  intereses: InteresesCliente
  proximoPaso?: string
  etiquetas: string[]
  createdAt: string
  updatedAt: string
}

export interface InteresesCliente {
  vehiculosInteres: string[]
  precioMaximo: number
  kilometrajeMaximo: number
  añoMinimo: number
  combustiblePreferido:
    | 'diesel'
    | 'gasolina'
    | 'hibrido'
    | 'electrico'
    | 'cualquiera'
  cambioPreferido: 'manual' | 'automatico' | 'cualquiera'
  coloresDeseados: string[]
  necesidadesEspeciales: string[]
  formaPagoPreferida:
    | 'financiacion'
    | 'contado'
    | 'entrega_usado'
    | 'cualquiera'
}

export interface NotaCliente {
  id: number
  clienteId: number
  fecha: string
  tipo: 'llamada' | 'visita' | 'mensaje' | 'presupuesto' | 'otro'
  titulo: string
  contenido: string
  archivos?: string[]
  recordatorio?: string
  createdAt: string
}

const DB_PATH = path.join(process.cwd(), 'data', 'vehiculos.json')
const INVERSORES_DB_PATH = path.join(process.cwd(), 'data', 'inversores.json')
const CLIENTES_DB_PATH = path.join(process.cwd(), 'data', 'clientes.json')
const NOTAS_CLIENTES_DB_PATH = path.join(
  process.cwd(),
  'data',
  'notas_clientes.json'
)

// Crear directorio si no existe
async function ensureDataDir() {
  const dataDir = path.dirname(DB_PATH)
  try {
    await fs.mkdir(dataDir, { recursive: true })
  } catch (error) {
    // Directorio ya existe
  }
}

// Leer vehículos desde JSON
export async function getVehiculos(): Promise<Vehiculo[]> {
  try {
    await ensureDataDir()
    const data = await fs.readFile(DB_PATH, 'utf-8')
    return JSON.parse(data)
  } catch (error) {
    return []
  }
}

// Guardar vehículo
export async function saveVehiculo(
  vehiculoData: Omit<Vehiculo, 'id' | 'createdAt' | 'updatedAt'>
): Promise<Vehiculo> {
  await ensureDataDir()

  const vehiculos = await getVehiculos()
  const newId =
    vehiculos.length > 0 ? Math.max(...vehiculos.map((v) => v.id)) + 1 : 1

  const newVehiculo: Vehiculo = {
    ...vehiculoData,
    id: newId,
    estado: '',
    orden: vehiculos.length,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  }

  vehiculos.push(newVehiculo)

  await fs.writeFile(DB_PATH, JSON.stringify(vehiculos, null, 2))

  return newVehiculo
}

// Verificar si existe referencia, matrícula o bastidor
export async function checkUniqueFields(
  referencia: string,
  matricula: string,
  bastidor: string,
  excludeId?: number
): Promise<{ field: string; exists: boolean } | null> {
  const vehiculos = await getVehiculos()

  const existing = vehiculos.find(
    (v) =>
      v.id !== excludeId &&
      (v.referencia === referencia ||
        v.matricula === matricula ||
        v.bastidor === bastidor)
  )

  if (!existing) return null

  if (existing.referencia === referencia)
    return { field: 'referencia', exists: true }
  if (existing.matricula === matricula)
    return { field: 'matrícula', exists: true }
  if (existing.bastidor === bastidor) return { field: 'bastidor', exists: true }

  return null
}

export async function getVehiculoById(id: number): Promise<Vehiculo | null> {
  const vehiculos = await getVehiculos()
  return vehiculos.find((v) => v.id === id) || null
}

export async function updateVehiculo(
  id: number,
  data: Omit<Vehiculo, 'id' | 'createdAt' | 'updatedAt'>
) {
  await ensureDataDir()

  const vehiculos = await getVehiculos()
  const index = vehiculos.findIndex((v) => v.id === id)

  if (index === -1) {
    throw new Error('Vehículo no encontrado')
  }

  const vehiculoActualizado: Vehiculo = {
    ...vehiculos[index],
    ...data,
    updatedAt: new Date().toISOString(),
  }

  vehiculos[index] = vehiculoActualizado

  await fs.writeFile(DB_PATH, JSON.stringify(vehiculos, null, 2))

  return vehiculoActualizado
}

export async function deleteVehiculo(id: number) {
  await ensureDataDir()

  const vehiculos = await getVehiculos()
  const vehiculosFiltrados = vehiculos.filter((v) => v.id !== id)

  if (vehiculosFiltrados.length === vehiculos.length) {
    throw new Error('Vehículo no encontrado')
  }

  await fs.writeFile(DB_PATH, JSON.stringify(vehiculosFiltrados, null, 2))

  return true
}

export async function clearVehiculos() {
  await ensureDataDir()

  // Crear array vacío de vehículos
  const vehiculosVacios: Vehiculo[] = []

  await fs.writeFile(DB_PATH, JSON.stringify(vehiculosVacios, null, 2))

  return true
}

// Actualizar estado y orden de un vehículo
export async function updateVehiculoEstado(
  id: number,
  estado: string,
  orden: number
) {
  await ensureDataDir()

  const vehiculos = await getVehiculos()
  const index = vehiculos.findIndex((v) => v.id === id)

  if (index === -1) {
    throw new Error('Vehículo no encontrado')
  }

  vehiculos[index].estado = estado
  vehiculos[index].orden = orden
  vehiculos[index].updatedAt = new Date().toISOString()

  await fs.writeFile(DB_PATH, JSON.stringify(vehiculos, null, 2))

  return vehiculos[index]
}

// Actualizar orden de múltiples vehículos
export async function updateVehiculosOrden(
  updates: Array<{ id: number; estado: string; orden: number }>
) {
  await ensureDataDir()

  const vehiculos = await getVehiculos()

  updates.forEach((update) => {
    const index = vehiculos.findIndex((v) => v.id === update.id)
    if (index !== -1) {
      vehiculos[index].estado = update.estado
      vehiculos[index].orden = update.orden
      vehiculos[index].updatedAt = new Date().toISOString()
    }
  })

  await fs.writeFile(DB_PATH, JSON.stringify(vehiculos, null, 2))

  return vehiculos
}

// ===== FUNCIONES DE INVERSORES =====

// Leer inversores desde JSON
export async function getInversores(): Promise<Inversor[]> {
  try {
    await ensureDataDir()
    const data = await fs.readFile(INVERSORES_DB_PATH, 'utf8')
    return JSON.parse(data)
  } catch (error) {
    return []
  }
}

// Guardar inversor
export async function saveInversor(
  inversorData: Omit<Inversor, 'id' | 'createdAt' | 'updatedAt'>
): Promise<Inversor> {
  await ensureDataDir()

  const inversores = await getInversores()
  const newId =
    inversores.length > 0 ? Math.max(...inversores.map((i) => i.id)) + 1 : 1

  const newInversor: Inversor = {
    ...inversorData,
    id: newId,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  }

  inversores.push(newInversor)

  await fs.writeFile(
    INVERSORES_DB_PATH,
    JSON.stringify(inversores, null, 2),
    'utf8'
  )

  return newInversor
}

// Actualizar inversor
export async function updateInversor(
  id: number,
  data: Omit<Inversor, 'id' | 'createdAt' | 'updatedAt'>
) {
  await ensureDataDir()

  const inversores = await getInversores()
  const index = inversores.findIndex((i) => i.id === id)

  if (index === -1) {
    throw new Error('Inversor no encontrado')
  }

  const inversorActualizado: Inversor = {
    ...inversores[index],
    ...data,
    updatedAt: new Date().toISOString(),
  }

  inversores[index] = inversorActualizado

  await fs.writeFile(
    INVERSORES_DB_PATH,
    JSON.stringify(inversores, null, 2),
    'utf8'
  )

  return inversorActualizado
}

// Eliminar inversor
export async function deleteInversor(id: number) {
  await ensureDataDir()

  const inversores = await getInversores()
  const inversoresFiltrados = inversores.filter((i) => i.id !== id)

  if (inversoresFiltrados.length === inversores.length) {
    throw new Error('Inversor no encontrado')
  }

  await fs.writeFile(
    INVERSORES_DB_PATH,
    JSON.stringify(inversoresFiltrados, null, 2)
  )

  return true
}

// Obtener inversor por ID
export async function getInversorById(id: number): Promise<Inversor | null> {
  const inversores = await getInversores()
  return inversores.find((i) => i.id === id) || null
}

// Obtener vehículos de un inversor
export async function getVehiculosByInversor(
  inversorId: number
): Promise<Vehiculo[]> {
  const vehiculos = await getVehiculos()
  return vehiculos.filter(
    (v) => v.esCocheInversor && v.inversorId === inversorId
  )
}

// Calcular métricas de inversor
export async function getInversorMetrics(
  inversorId: number,
  periodo?: { desde: string; hasta: string }
) {
  const inversor = await getInversorById(inversorId)
  if (!inversor) {
    throw new Error('Inversor no encontrado')
  }

  const vehiculos = await getVehiculosByInversor(inversorId)

  let vehiculosFiltrados = vehiculos
  if (periodo) {
    vehiculosFiltrados = vehiculos.filter((v) => {
      const fechaCompra = v.fechaCompra
        ? new Date(v.fechaCompra)
        : new Date(v.createdAt)
      return (
        fechaCompra >= new Date(periodo.desde) &&
        fechaCompra <= new Date(periodo.hasta)
      )
    })
  }

  const vendidos = vehiculosFiltrados.filter((v) => v.estado === 'vendido')
  const enStock = vehiculosFiltrados.filter((v) => v.estado !== 'vendido')

  const beneficioAcumulado = vendidos.reduce((sum, v) => {
    const beneficio = Number(v.beneficioNeto) || 0
    return sum + (isNaN(beneficio) ? 0 : beneficio)
  }, 0)
  const capitalInvertidoActual = enStock.reduce((sum, v) => {
    const precio = Number(v.precioCompra) || 0
    return sum + (isNaN(precio) ? 0 : precio)
  }, 0)
  const capitalAportado = inversor.capitalAportado || 0
  const capitalInvertido =
    inversor.capitalInvertido || capitalInvertidoActual || 0
  const capitalDisponible = (capitalAportado || 0) - (capitalInvertido || 0)

  const roi =
    capitalAportado > 0 ? (beneficioAcumulado / capitalAportado) * 100 : 0

  return {
    beneficioAcumulado,
    capitalInvertido,
    capitalInvertidoActual,
    capitalAportado,
    capitalDisponible,
    roi,
    totalVendidos: vendidos.length,
    totalEnStock: enStock.length,
    diasPromedioEnStock:
      enStock.length > 0
        ? enStock.reduce((sum, v) => {
            const dias = Math.floor(
              (Date.now() - new Date(v.createdAt).getTime()) /
                (1000 * 60 * 60 * 24)
            )
            return sum + dias
          }, 0) / enStock.length
        : 0,
  }
}

// ===== FUNCIONES PARA CLIENTES =====

// Obtener todos los clientes
export async function getClientes(): Promise<Cliente[]> {
  await ensureDataDir()
  try {
    const data = await fs.readFile(CLIENTES_DB_PATH, 'utf-8')
    return JSON.parse(data)
  } catch (error) {
    return []
  }
}

// Obtener cliente por ID
export async function getClienteById(id: number): Promise<Cliente | null> {
  const clientes = await getClientes()
  return clientes.find((c) => c.id === id) || null
}

// Guardar cliente
export async function saveCliente(
  cliente: Omit<Cliente, 'id' | 'createdAt' | 'updatedAt'>
): Promise<Cliente> {
  await ensureDataDir()
  const clientes = await getClientes()

  const nuevoCliente: Cliente = {
    ...cliente,
    id: clientes.length > 0 ? Math.max(...clientes.map((c) => c.id)) + 1 : 1,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  }

  clientes.push(nuevoCliente)
  await fs.writeFile(CLIENTES_DB_PATH, JSON.stringify(clientes, null, 2))
  return nuevoCliente
}

// Actualizar cliente
export async function updateCliente(
  id: number,
  updates: Partial<Omit<Cliente, 'id' | 'createdAt'>>
): Promise<Cliente> {
  const clientes = await getClientes()
  const index = clientes.findIndex((c) => c.id === id)

  if (index === -1) {
    throw new Error('Cliente no encontrado')
  }

  clientes[index] = {
    ...clientes[index],
    ...updates,
    updatedAt: new Date().toISOString(),
  }

  await fs.writeFile(CLIENTES_DB_PATH, JSON.stringify(clientes, null, 2))
  return clientes[index]
}

// Eliminar cliente
export async function deleteCliente(id: number): Promise<void> {
  const clientes = await getClientes()
  const filteredClientes = clientes.filter((c) => c.id !== id)

  if (clientes.length === filteredClientes.length) {
    throw new Error('Cliente no encontrado')
  }

  await fs.writeFile(
    CLIENTES_DB_PATH,
    JSON.stringify(filteredClientes, null, 2)
  )
}

// ===== FUNCIONES PARA NOTAS DE CLIENTES =====

// Obtener todas las notas de un cliente
export async function getNotasByCliente(
  clienteId: number
): Promise<NotaCliente[]> {
  await ensureDataDir()
  try {
    const data = await fs.readFile(NOTAS_CLIENTES_DB_PATH, 'utf-8')
    const notas: NotaCliente[] = JSON.parse(data)
    return notas
      .filter((n) => n.clienteId === clienteId)
      .sort((a, b) => new Date(b.fecha).getTime() - new Date(a.fecha).getTime())
  } catch (error) {
    return []
  }
}

// Agregar nota a cliente
export async function addNotaCliente(
  nota: Omit<NotaCliente, 'id' | 'createdAt'>
): Promise<NotaCliente> {
  await ensureDataDir()
  let notas: NotaCliente[] = []

  try {
    const data = await fs.readFile(NOTAS_CLIENTES_DB_PATH, 'utf-8')
    notas = JSON.parse(data)
  } catch (error) {
    notas = []
  }

  const nuevaNota: NotaCliente = {
    ...nota,
    id: notas.length > 0 ? Math.max(...notas.map((n) => n.id)) + 1 : 1,
    createdAt: new Date().toISOString(),
  }

  notas.push(nuevaNota)
  await fs.writeFile(NOTAS_CLIENTES_DB_PATH, JSON.stringify(notas, null, 2))
  return nuevaNota
}

// ===== FUNCIONES DE BÚSQUEDA INTELIGENTE =====

// Buscar clientes por criterios de vehículo
export async function buscarClientesPorVehiculo(criterios: {
  marca?: string
  modelo?: string
  precioMaximo?: number
  kilometrajeMaximo?: number
  añoMinimo?: number
  combustible?: string
  cambio?: string
}): Promise<Cliente[]> {
  const clientes = await getClientes()

  return clientes.filter((cliente) => {
    const intereses = cliente.intereses

    // Filtro por marca/modelo
    if (
      criterios.marca &&
      !intereses.vehiculoPrincipal
        .toLowerCase()
        .includes(criterios.marca.toLowerCase()) &&
      !intereses.modelosAlternativos.some((m) =>
        m.toLowerCase().includes(criterios.marca!.toLowerCase())
      )
    ) {
      return false
    }

    if (
      criterios.modelo &&
      !intereses.vehiculoPrincipal
        .toLowerCase()
        .includes(criterios.modelo.toLowerCase()) &&
      !intereses.modelosAlternativos.some((m) =>
        m.toLowerCase().includes(criterios.modelo!.toLowerCase())
      )
    ) {
      return false
    }

    // Filtro por precio
    if (
      criterios.precioMaximo &&
      intereses.precioMaximo > criterios.precioMaximo
    ) {
      return false
    }

    // Filtro por kilometraje
    if (
      criterios.kilometrajeMaximo &&
      intereses.kilometrajeMaximo > criterios.kilometrajeMaximo
    ) {
      return false
    }

    // Filtro por año
    if (criterios.añoMinimo && intereses.añoMinimo > criterios.añoMinimo) {
      return false
    }

    // Filtro por combustible
    if (
      criterios.combustible &&
      intereses.combustiblePreferido !== 'cualquiera' &&
      intereses.combustiblePreferido !== criterios.combustible
    ) {
      return false
    }

    // Filtro por cambio
    if (
      criterios.cambio &&
      intereses.cambioPreferido !== 'cualquiera' &&
      intereses.cambioPreferido !== criterios.cambio
    ) {
      return false
    }

    return true
  })
}

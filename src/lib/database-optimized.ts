import { prisma } from './prisma'
import { Prisma } from '@prisma/client'

// Tipos optimizados
export type VehiculoWithInversor = Prisma.VehiculoGetPayload<{
  include: { inversor: true }
}>

export type ClienteWithNotas = Prisma.ClienteGetPayload<{
  include: { notas: true }
}>

// Servicio de Vehículos optimizado
export class VehiculoService {
  // Obtener vehículos con paginación y filtros
  static async getVehiculos({
    page = 1,
    limit = 20,
    search,
    tipo,
    estado,
    inversorId,
    orderBy = 'createdAt',
    orderDirection = 'desc'
  }: {
    page?: number
    limit?: number
    search?: string
    tipo?: string
    estado?: string
    inversorId?: number
    orderBy?: string
    orderDirection?: 'asc' | 'desc'
  } = {}) {
    const skip = (page - 1) * limit
    
    const where: Prisma.VehiculoWhereInput = {}
    
    if (search) {
      where.OR = [
        { referencia: { contains: search, mode: 'insensitive' } },
        { marca: { contains: search, mode: 'insensitive' } },
        { modelo: { contains: search, mode: 'insensitive' } },
        { matricula: { contains: search, mode: 'insensitive' } },
        { bastidor: { contains: search, mode: 'insensitive' } }
      ]
    }
    
    if (tipo) where.tipo = tipo
    if (estado) where.estado = estado
    if (inversorId) where.inversorId = inversorId

    const [vehiculos, total] = await Promise.all([
      prisma.vehiculo.findMany({
        where,
        include: {
          inversor: {
            select: { id: true, nombre: true }
          }
        },
        skip,
        take: limit,
        orderBy: { [orderBy]: orderDirection }
      }),
      prisma.vehiculo.count({ where })
    ])

    return {
      vehiculos,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
        hasNext: page * limit < total,
        hasPrev: page > 1
      }
    }
  }

  // Crear vehículo
  static async createVehiculo(data: Prisma.VehiculoCreateInput) {
    return prisma.vehiculo.create({
      data,
      include: {
        inversor: {
          select: { id: true, nombre: true }
        }
      }
    })
  }

  // Actualizar vehículo
  static async updateVehiculo(id: number, data: Prisma.VehiculoUpdateInput) {
    return prisma.vehiculo.update({
      where: { id },
      data,
      include: {
        inversor: {
          select: { id: true, nombre: true }
        }
      }
    })
  }

  // Eliminar vehículo
  static async deleteVehiculo(id: number) {
    return prisma.vehiculo.delete({
      where: { id }
    })
  }

  // Verificar campos únicos
  static async checkUniqueFields(referencia: string, matricula: string, bastidor: string) {
    const existing = await prisma.vehiculo.findFirst({
      where: {
        OR: [
          { referencia },
          { matricula },
          { bastidor }
        ]
      },
      select: { referencia: true, matricula: true, bastidor: true }
    })

    if (existing) {
      if (existing.referencia === referencia) return { field: 'referencia', value: referencia }
      if (existing.matricula === matricula) return { field: 'matricula', value: matricula }
      if (existing.bastidor === bastidor) return { field: 'bastidor', value: bastidor }
    }

    return null
  }
}

// Servicio de Clientes optimizado
export class ClienteService {
  // Obtener clientes con paginación y búsqueda
  static async getClientes({
    page = 1,
    limit = 20,
    search,
    estado,
    prioridad,
    orderBy = 'createdAt',
    orderDirection = 'desc'
  }: {
    page?: number
    limit?: number
    search?: string
    estado?: string
    prioridad?: string
    orderBy?: string
    orderDirection?: 'asc' | 'desc'
  } = {}) {
    const skip = (page - 1) * limit
    
    const where: Prisma.ClienteWhereInput = {}
    
    if (search) {
      where.OR = [
        { nombre: { contains: search, mode: 'insensitive' } },
        { apellidos: { contains: search, mode: 'insensitive' } },
        { telefono: { contains: search, mode: 'insensitive' } },
        { email: { contains: search, mode: 'insensitive' } }
      ]
    }
    
    if (estado) where.estado = estado
    if (prioridad) where.prioridad = prioridad

    const [clientes, total] = await Promise.all([
      prisma.cliente.findMany({
        where,
        include: {
          notas: {
            orderBy: { createdAt: 'desc' },
            take: 3
          }
        },
        skip,
        take: limit,
        orderBy: { [orderBy]: orderDirection }
      }),
      prisma.cliente.count({ where })
    ])

    return {
      clientes,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
        hasNext: page * limit < total,
        hasPrev: page > 1
      }
    }
  }

  // Buscar clientes (para autocompletado)
  static async searchClientes(query: string, limit = 10) {
    if (query.length < 2) return []
    
    return prisma.cliente.findMany({
      where: {
        OR: [
          { nombre: { contains: query, mode: 'insensitive' } },
          { apellidos: { contains: query, mode: 'insensitive' } },
          { telefono: { contains: query, mode: 'insensitive' } },
          { email: { contains: query, mode: 'insensitive' } }
        ]
      },
      take: limit,
      orderBy: { createdAt: 'desc' }
    })
  }

  // Crear cliente
  static async createCliente(data: Prisma.ClienteCreateInput) {
    return prisma.cliente.create({
      data,
      include: {
        notas: true
      }
    })
  }

  // Actualizar cliente
  static async updateCliente(id: number, data: Prisma.ClienteUpdateInput) {
    return prisma.cliente.update({
      where: { id },
      data,
      include: {
        notas: true
      }
    })
  }

  // Obtener cliente por ID con notas
  static async getClienteById(id: number) {
    return prisma.cliente.findUnique({
      where: { id },
      include: {
        notas: {
          orderBy: { createdAt: 'desc' }
        }
      }
    })
  }
}

// Servicio de Inversores optimizado
export class InversorService {
  // Obtener inversores con métricas
  static async getInversores() {
    return prisma.inversor.findMany({
      where: { activo: true },
      include: {
        _count: {
          select: { vehiculos: true }
        }
      },
      orderBy: { nombre: 'asc' }
    })
  }

  // Obtener métricas de un inversor
  static async getInversorMetrics(inversorId: number) {
    const [vehiculos, totalInversion, totalBeneficio] = await Promise.all([
      prisma.vehiculo.findMany({
        where: { inversorId },
        select: {
          id: true,
          referencia: true,
          marca: true,
          modelo: true,
          precioCompra: true,
          precioVenta: true,
          beneficioNeto: true,
          estado: true
        }
      }),
      prisma.vehiculo.aggregate({
        where: { inversorId },
        _sum: { precioCompra: true }
      }),
      prisma.vehiculo.aggregate({
        where: { inversorId },
        _sum: { beneficioNeto: true }
      })
    ])

    return {
      vehiculos,
      totalInversion: totalInversion._sum.precioCompra || 0,
      totalBeneficio: totalBeneficio._sum.beneficioNeto || 0,
      vehiculosActivos: vehiculos.filter(v => v.estado === 'disponible').length
    }
  }
}

// Servicio de Notas
export class NotaService {
  // Crear nota
  static async createNota(data: Prisma.NotaClienteCreateInput) {
    return prisma.notaCliente.create({
      data,
      include: {
        cliente: {
          select: { id: true, nombre: true, apellidos: true }
        }
      }
    })
  }

  // Obtener notas de un cliente
  static async getNotasByCliente(clienteId: number) {
    return prisma.notaCliente.findMany({
      where: { clienteId },
      orderBy: { createdAt: 'desc' }
    })
  }
}

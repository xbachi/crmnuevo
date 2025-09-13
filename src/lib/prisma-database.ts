import { PrismaClient } from '@prisma/client'

// Crear nueva instancia para cada operación para evitar prepared statements
function getPrismaClient() {
  return new PrismaClient({
    datasources: {
      db: {
        url: process.env.DATABASE_URL
      }
    }
  })
}

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
  createdAt: Date
  updatedAt: Date
  // Campos adicionales de Google Sheets
  fechaMatriculacion?: string | null
  año?: number | null
  itv?: string | null
  seguro?: string | null
  segundaLlave?: string | null
  documentacion?: string | null
  carpeta?: string | null
  master?: string | null
  hojasA?: string | null
  // Campos de inversor
  esCocheInversor?: boolean
  inversorId?: number | null
  inversorNombre?: string
  fechaCompra?: Date | null
  precioCompra?: number | null
  gastosTransporte?: number | null
  gastosTasas?: number | null
  gastosMecanica?: number | null
  gastosPintura?: number | null
  gastosLimpieza?: number | null
  gastosOtros?: number | null
  precioPublicacion?: number | null
  precioVenta?: number | null
  beneficioNeto?: number | null
  notasInversor?: string | null
  fotoInversor?: string | null
}

export async function getVehiculos(): Promise<Vehiculo[]> {
  const prisma = getPrismaClient()
  try {
    const vehiculos = await prisma.vehiculo.findMany({
      orderBy: { id: 'asc' }
    })
    return vehiculos as Vehiculo[]
  } catch (error) {
    console.error('Error obteniendo vehículos:', error)
    return []
  } finally {
    await prisma.$disconnect()
  }
}

export async function checkUniqueFields(referencia: string, matricula: string, bastidor: string, excludeId?: number) {
  const prisma = getPrismaClient()
  try {
    const existingVehiculo = await prisma.vehiculo.findFirst({
      where: {
        AND: [
          { id: excludeId ? { not: excludeId } : undefined },
          {
            OR: [
              { referencia },
              { matricula },
              { bastidor }
            ]
          }
        ].filter(Boolean)
      }
    })

    if (existingVehiculo) {
      if (existingVehiculo.referencia === referencia) {
        return { field: 'referencia', value: referencia }
      }
      if (existingVehiculo.matricula === matricula) {
        return { field: 'matrícula', value: matricula }
      }
      if (existingVehiculo.bastidor === bastidor) {
        return { field: 'bastidor', value: bastidor }
      }
    }

    return null
  } catch (error) {
    console.error('Error verificando campos únicos:', error)
    return null
  } finally {
    await prisma.$disconnect()
  }
}

export async function saveVehiculo(vehiculoData: Omit<Vehiculo, 'id' | 'createdAt' | 'updatedAt'>): Promise<Vehiculo> {
  const prisma = getPrismaClient()
  try {
    const vehiculo = await prisma.vehiculo.create({
      data: {
        referencia: vehiculoData.referencia,
        marca: vehiculoData.marca,
        modelo: vehiculoData.modelo,
        matricula: vehiculoData.matricula,
        bastidor: vehiculoData.bastidor,
        kms: vehiculoData.kms,
        tipo: vehiculoData.tipo,
        estado: vehiculoData.estado,
        orden: vehiculoData.orden,
        fechaMatriculacion: vehiculoData.fechaMatriculacion,
        año: vehiculoData.año,
        itv: vehiculoData.itv,
        seguro: vehiculoData.seguro,
        segundaLlave: vehiculoData.segundaLlave,
        documentacion: vehiculoData.documentacion,
        carpeta: vehiculoData.carpeta,
        master: vehiculoData.master,
        hojasA: vehiculoData.hojasA,
        esCocheInversor: vehiculoData.esCocheInversor || false,
        inversorId: vehiculoData.inversorId,
        fechaCompra: vehiculoData.fechaCompra,
        precioCompra: vehiculoData.precioCompra,
        gastosTransporte: vehiculoData.gastosTransporte,
        gastosTasas: vehiculoData.gastosTasas,
        gastosMecanica: vehiculoData.gastosMecanica,
        gastosPintura: vehiculoData.gastosPintura,
        gastosLimpieza: vehiculoData.gastosLimpieza,
        gastosOtros: vehiculoData.gastosOtros,
        precioPublicacion: vehiculoData.precioPublicacion,
        precioVenta: vehiculoData.precioVenta,
        beneficioNeto: vehiculoData.beneficioNeto,
        notasInversor: vehiculoData.notasInversor,
        fotoInversor: vehiculoData.fotoInversor
      }
    })
    return vehiculo as Vehiculo
  } catch (error) {
    console.error('Error guardando vehículo:', error)
    throw error
  } finally {
    await prisma.$disconnect()
  }
}

export async function getVehiculoById(id: number): Promise<Vehiculo | null> {
  const prisma = getPrismaClient()
  try {
    const vehiculo = await prisma.vehiculo.findUnique({
      where: { id }
    })
    return vehiculo as Vehiculo | null
  } catch (error) {
    console.error('Error obteniendo vehículo por ID:', error)
    return null
  } finally {
    await prisma.$disconnect()
  }
}

export async function updateVehiculo(id: number, data: Partial<Omit<Vehiculo, 'id' | 'createdAt' | 'updatedAt'>>) {
  try {
    const vehiculo = await prisma.vehiculo.update({
      where: { id },
      data: {
        ...data,
        updatedAt: new Date()
      }
    })
    return vehiculo as Vehiculo
  } catch (error) {
    console.error('Error actualizando vehículo:', error)
    throw error
  } finally {
    await prisma.$disconnect()
  }
}

export async function deleteVehiculo(id: number) {
  const prisma = getPrismaClient()
  try {
    await prisma.vehiculo.delete({
      where: { id }
    })
    return true
  } catch (error) {
    console.error('Error eliminando vehículo:', error)
    throw error
  } finally {
    await prisma.$disconnect()
  }
}

export async function clearVehiculos() {
  const prisma = getPrismaClient()
  try {
    await prisma.vehiculo.deleteMany({})
    return true
  } catch (error) {
    console.error('Error limpiando vehículos:', error)
    throw error
  } finally {
    await prisma.$disconnect()
  }
}

export async function updateVehiculoEstado(id: number, estado: string, orden: number) {
  try {
    const vehiculo = await prisma.vehiculo.update({
      where: { id },
      data: {
        estado,
        orden,
        updatedAt: new Date()
      }
    })
    return vehiculo as Vehiculo
  } catch (error) {
    console.error('Error actualizando estado del vehículo:', error)
    throw error
  }
}

export async function updateVehiculosOrden(updates: Array<{ id: number; estado: string; orden: number }>) {
  try {
    const promises = updates.map(update => 
      prisma.vehiculo.update({
        where: { id: update.id },
        data: {
          estado: update.estado,
          orden: update.orden,
          updatedAt: new Date()
        }
      })
    )
    
    await Promise.all(promises)
    return true
  } catch (error) {
    console.error('Error actualizando orden de vehículos:', error)
    throw error
  }
}

export async function getVehiculosByInversor(inversorId: number): Promise<Vehiculo[]> {
  try {
    const vehiculos = await prisma.vehiculo.findMany({
      where: { inversorId },
      orderBy: { id: 'asc' }
    })
    return vehiculos as Vehiculo[]
  } catch (error) {
    console.error('Error obteniendo vehículos por inversor:', error)
    return []
  }
}

// Funciones para inversores
export async function getInversores() {
  const prisma = getPrismaClient()
  try {
    return await prisma.inversor.findMany({
      orderBy: { id: 'asc' }
    })
  } catch (error) {
    console.error('Error obteniendo inversores:', error)
    return []
  } finally {
    await prisma.$disconnect()
  }
}

export async function saveInversor(inversorData: any) {
  const prisma = getPrismaClient()
  try {
    return await prisma.inversor.create({
      data: inversorData
    })
  } catch (error) {
    console.error('Error guardando inversor:', error)
    throw error
  } finally {
    await prisma.$disconnect()
  }
}

export async function updateInversor(id: number, data: any) {
  try {
    return await prisma.inversor.update({
      where: { id },
      data: {
        ...data,
        updatedAt: new Date()
      }
    })
  } catch (error) {
    console.error('Error actualizando inversor:', error)
    throw error
  }
}

export async function deleteInversor(id: number) {
  try {
    await prisma.inversor.delete({
      where: { id }
    })
    return true
  } catch (error) {
    console.error('Error eliminando inversor:', error)
    throw error
  }
}

// Funciones para clientes
export async function getClientes() {
  try {
    return await prisma.cliente.findMany({
      orderBy: { id: 'asc' }
    })
  } catch (error) {
    console.error('Error obteniendo clientes:', error)
    return []
  }
}

export async function saveCliente(clienteData: any) {
  try {
    return await prisma.cliente.create({
      data: clienteData
    })
  } catch (error) {
    console.error('Error guardando cliente:', error)
    throw error
  }
}

export async function updateCliente(id: number, data: any) {
  try {
    return await prisma.cliente.update({
      where: { id },
      data: {
        ...data,
        updatedAt: new Date()
      }
    })
  } catch (error) {
    console.error('Error actualizando cliente:', error)
    throw error
  }
}

export async function deleteCliente(id: number) {
  try {
    await prisma.cliente.delete({
      where: { id }
    })
    return true
  } catch (error) {
    console.error('Error eliminando cliente:', error)
    throw error
  }
}

// Funciones para notas de clientes
export async function getNotasCliente(clienteId: number) {
  try {
    return await prisma.notaCliente.findMany({
      where: { clienteId },
      orderBy: { fecha: 'desc' }
    })
  } catch (error) {
    console.error('Error obteniendo notas del cliente:', error)
    return []
  }
}

export async function saveNotaCliente(notaData: any) {
  try {
    return await prisma.notaCliente.create({
      data: notaData
    })
  } catch (error) {
    console.error('Error guardando nota del cliente:', error)
    throw error
  }
}

export async function updateNotaCliente(id: number, data: any) {
  try {
    return await prisma.notaCliente.update({
      where: { id },
      data: {
        ...data,
        updatedAt: new Date()
      }
    })
  } catch (error) {
    console.error('Error actualizando nota del cliente:', error)
    throw error
  }
}

export async function deleteNotaCliente(id: number) {
  try {
    await prisma.notaCliente.delete({
      where: { id }
    })
    return true
  } catch (error) {
    console.error('Error eliminando nota del cliente:', error)
    throw error
  }
}

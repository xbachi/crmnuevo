const { PrismaClient } = require('@prisma/client')
const fs = require('fs').promises
const path = require('path')

const prisma = new PrismaClient()

async function migrateFromJsonToPostgreSQL() {
  console.log('🚀 Iniciando migración de datos JSON a PostgreSQL...')
  
  try {
    // Leer datos de los archivos JSON
    const dataDir = path.join(process.cwd(), 'data')
    
    const vehiculosData = await fs.readFile(path.join(dataDir, 'vehiculos.json'), 'utf8')
    const inversoresData = await fs.readFile(path.join(dataDir, 'inversores.json'), 'utf8')
    const clientesData = await fs.readFile(path.join(dataDir, 'clientes.json'), 'utf8')
    const notasData = await fs.readFile(path.join(dataDir, 'notas_clientes.json'), 'utf8')
    
    const vehiculos = JSON.parse(vehiculosData)
    const inversores = JSON.parse(inversoresData)
    const clientes = JSON.parse(clientesData)
    const notas = JSON.parse(notasData)
    
    console.log(`📊 Datos encontrados:`)
    console.log(`   - Vehículos: ${vehiculos.length}`)
    console.log(`   - Inversores: ${inversores.length}`)
    console.log(`   - Clientes: ${clientes.length}`)
    console.log(`   - Notas: ${notas.length}`)
    
    // Migrar inversores primero (por las relaciones)
    console.log('\n👥 Migrando inversores...')
    for (const inversor of inversores) {
      await prisma.inversor.upsert({
        where: { id: inversor.id },
        update: {
          nombre: inversor.nombre,
          email: inversor.email,
          telefono: inversor.telefono,
          direccion: inversor.direccion,
          notas: inversor.notas,
          activo: inversor.activo !== false,
          createdAt: new Date(inversor.createdAt),
          updatedAt: new Date(inversor.updatedAt)
        },
        create: {
          id: inversor.id,
          nombre: inversor.nombre,
          email: inversor.email,
          telefono: inversor.telefono,
          direccion: inversor.direccion,
          notas: inversor.notas,
          activo: inversor.activo !== false,
          createdAt: new Date(inversor.createdAt),
          updatedAt: new Date(inversor.updatedAt)
        }
      })
    }
    console.log('✅ Inversores migrados')
    
    // Migrar vehículos
    console.log('\n🚗 Migrando vehículos...')
    for (const vehiculo of vehiculos) {
      await prisma.vehiculo.upsert({
        where: { id: vehiculo.id },
        update: {
          referencia: vehiculo.referencia,
          marca: vehiculo.marca,
          modelo: vehiculo.modelo,
          matricula: vehiculo.matricula,
          bastidor: vehiculo.bastidor,
          kms: vehiculo.kms,
          tipo: vehiculo.tipo,
          estado: vehiculo.estado || 'disponible',
          orden: vehiculo.orden || 0,
          fechaMatriculacion: vehiculo.fechaMatriculacion,
          año: vehiculo.año,
          itv: vehiculo.itv,
          seguro: vehiculo.seguro,
          segundaLlave: vehiculo.segundaLlave || false,
          documentacion: vehiculo.documentacion,
          esCocheInversor: vehiculo.esCocheInversor || false,
          inversorId: vehiculo.inversorId || null,
          fechaCompra: vehiculo.fechaCompra,
          precioCompra: vehiculo.precioCompra ? parseFloat(vehiculo.precioCompra) : null,
          gastosTransporte: vehiculo.gastosTransporte ? parseFloat(vehiculo.gastosTransporte) : null,
          gastosTasas: vehiculo.gastosTasas ? parseFloat(vehiculo.gastosTasas) : null,
          gastosMecanica: vehiculo.gastosMecanica ? parseFloat(vehiculo.gastosMecanica) : null,
          gastosPintura: vehiculo.gastosPintura ? parseFloat(vehiculo.gastosPintura) : null,
          gastosLimpieza: vehiculo.gastosLimpieza ? parseFloat(vehiculo.gastosLimpieza) : null,
          gastosOtros: vehiculo.gastosOtros ? parseFloat(vehiculo.gastosOtros) : null,
          precioPublicacion: vehiculo.precioPublicacion ? parseFloat(vehiculo.precioPublicacion) : null,
          precioVenta: vehiculo.precioVenta ? parseFloat(vehiculo.precioVenta) : null,
          beneficioNeto: vehiculo.beneficioNeto ? parseFloat(vehiculo.beneficioNeto) : null,
          notasInversor: vehiculo.notasInversor,
          fotoInversor: vehiculo.fotoInversor,
          createdAt: new Date(vehiculo.createdAt),
          updatedAt: new Date(vehiculo.updatedAt)
        },
        create: {
          id: vehiculo.id,
          referencia: vehiculo.referencia,
          marca: vehiculo.marca,
          modelo: vehiculo.modelo,
          matricula: vehiculo.matricula,
          bastidor: vehiculo.bastidor,
          kms: vehiculo.kms,
          tipo: vehiculo.tipo,
          estado: vehiculo.estado || 'disponible',
          orden: vehiculo.orden || 0,
          fechaMatriculacion: vehiculo.fechaMatriculacion,
          año: vehiculo.año,
          itv: vehiculo.itv,
          seguro: vehiculo.seguro,
          segundaLlave: vehiculo.segundaLlave || false,
          documentacion: vehiculo.documentacion,
          esCocheInversor: vehiculo.esCocheInversor || false,
          inversorId: vehiculo.inversorId || null,
          fechaCompra: vehiculo.fechaCompra,
          precioCompra: vehiculo.precioCompra ? parseFloat(vehiculo.precioCompra) : null,
          gastosTransporte: vehiculo.gastosTransporte ? parseFloat(vehiculo.gastosTransporte) : null,
          gastosTasas: vehiculo.gastosTasas ? parseFloat(vehiculo.gastosTasas) : null,
          gastosMecanica: vehiculo.gastosMecanica ? parseFloat(vehiculo.gastosMecanica) : null,
          gastosPintura: vehiculo.gastosPintura ? parseFloat(vehiculo.gastosPintura) : null,
          gastosLimpieza: vehiculo.gastosLimpieza ? parseFloat(vehiculo.gastosLimpieza) : null,
          gastosOtros: vehiculo.gastosOtros ? parseFloat(vehiculo.gastosOtros) : null,
          precioPublicacion: vehiculo.precioPublicacion ? parseFloat(vehiculo.precioPublicacion) : null,
          precioVenta: vehiculo.precioVenta ? parseFloat(vehiculo.precioVenta) : null,
          beneficioNeto: vehiculo.beneficioNeto ? parseFloat(vehiculo.beneficioNeto) : null,
          notasInversor: vehiculo.notasInversor,
          fotoInversor: vehiculo.fotoInversor,
          createdAt: new Date(vehiculo.createdAt),
          updatedAt: new Date(vehiculo.updatedAt)
        }
      })
    }
    console.log('✅ Vehículos migrados')
    
    // Migrar clientes
    console.log('\n👤 Migrando clientes...')
    for (const cliente of clientes) {
      await prisma.cliente.upsert({
        where: { id: cliente.id },
        update: {
          nombre: cliente.nombre,
          apellidos: cliente.apellidos,
          telefono: cliente.telefono,
          email: cliente.email,
          whatsapp: cliente.whatsapp,
          comoLlego: cliente.comoLlego,
          fechaPrimerContacto: new Date(cliente.fechaPrimerContacto),
          estado: cliente.estado || 'nuevo',
          prioridad: cliente.prioridad || 'media',
          proximoPaso: cliente.proximoPaso,
          etiquetas: cliente.etiquetas || [],
          intereses: cliente.intereses || {},
          createdAt: new Date(cliente.createdAt),
          updatedAt: new Date(cliente.updatedAt)
        },
        create: {
          id: cliente.id,
          nombre: cliente.nombre,
          apellidos: cliente.apellidos,
          telefono: cliente.telefono,
          email: cliente.email,
          whatsapp: cliente.whatsapp,
          comoLlego: cliente.comoLlego,
          fechaPrimerContacto: new Date(cliente.fechaPrimerContacto),
          estado: cliente.estado || 'nuevo',
          prioridad: cliente.prioridad || 'media',
          proximoPaso: cliente.proximoPaso,
          etiquetas: cliente.etiquetas || [],
          intereses: cliente.intereses || {},
          createdAt: new Date(cliente.createdAt),
          updatedAt: new Date(cliente.updatedAt)
        }
      })
    }
    console.log('✅ Clientes migrados')
    
    // Migrar notas
    console.log('\n📝 Migrando notas...')
    for (const nota of notas) {
      await prisma.notaCliente.upsert({
        where: { id: nota.id },
        update: {
          clienteId: nota.clienteId,
          titulo: nota.titulo,
          contenido: nota.contenido,
          tipo: nota.tipo || 'general',
          recordatorio: nota.recordatorio ? new Date(nota.recordatorio) : null,
          createdAt: new Date(nota.createdAt)
        },
        create: {
          id: nota.id,
          clienteId: nota.clienteId,
          titulo: nota.titulo,
          contenido: nota.contenido,
          tipo: nota.tipo || 'general',
          recordatorio: nota.recordatorio ? new Date(nota.recordatorio) : null,
          createdAt: new Date(nota.createdAt)
        }
      })
    }
    console.log('✅ Notas migradas')
    
    console.log('\n🎉 ¡Migración completada exitosamente!')
    
  } catch (error) {
    console.error('❌ Error durante la migración:', error)
    throw error
  } finally {
    await prisma.$disconnect()
  }
}

// Ejecutar migración si se llama directamente
if (require.main === module) {
  migrateFromJsonToPostgreSQL()
    .then(() => {
      console.log('✅ Script de migración finalizado')
      process.exit(0)
    })
    .catch((error) => {
      console.error('❌ Error en script de migración:', error)
      process.exit(1)
    })
}

module.exports = { migrateFromJsonToPostgreSQL }

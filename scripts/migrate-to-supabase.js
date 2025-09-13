#!/usr/bin/env node

/**
 * Script para migrar datos desde archivos JSON locales a Supabase
 * 
 * Uso:
 * 1. Configura DATABASE_URL en .env.local
 * 2. Ejecuta: node scripts/migrate-to-supabase.js
 */

const { PrismaClient } = require('@prisma/client')
const fs = require('fs').promises
const path = require('path')

const prisma = new PrismaClient()

async function migrateToSupabase() {
  console.log('🚀 Iniciando migración a Supabase...')

  try {
    // Verificar conexión a la base de datos
    await prisma.$connect()
    console.log('✅ Conexión a Supabase establecida')

    // Leer datos de archivos JSON locales
    const dataDir = path.join(__dirname, '../data')
    
    console.log('📖 Leyendo datos locales...')
    
    // Leer vehículos
    const vehiculosData = await fs.readFile(path.join(dataDir, 'vehiculos.json'), 'utf8')
    const vehiculos = JSON.parse(vehiculosData)
    
    // Leer inversores
    const inversoresData = await fs.readFile(path.join(dataDir, 'inversores.json'), 'utf8')
    const inversores = JSON.parse(inversoresData)
    
    // Leer clientes
    const clientesData = await fs.readFile(path.join(dataDir, 'clientes.json'), 'utf8')
    const clientes = JSON.parse(clientesData)
    
    // Leer notas
    const notasData = await fs.readFile(path.join(dataDir, 'notas_clientes.json'), 'utf8')
    const notas = JSON.parse(notasData)

    console.log(`📊 Datos encontrados:`)
    console.log(`   - Vehículos: ${vehiculos.length}`)
    console.log(`   - Inversores: ${inversores.length}`)
    console.log(`   - Clientes: ${clientes.length}`)
    console.log(`   - Notas: ${notas.length}`)

    // Limpiar tablas existentes (opcional)
    console.log('🧹 Limpiando datos existentes...')
    await prisma.notaCliente.deleteMany()
    await prisma.cliente.deleteMany()
    await prisma.vehiculo.deleteMany()
    await prisma.inversor.deleteMany()

    // Migrar inversores
    console.log('👥 Migrando inversores...')
    for (const inversor of inversores) {
      await prisma.inversor.create({
        data: {
          id: inversor.id,
          nombre: inversor.nombre,
          email: inversor.email,
          telefono: inversor.telefono,
          capitalAportado: inversor.capitalAportado || 0,
          capitalInvertido: inversor.capitalInvertido || 0,
          activo: inversor.activo !== false,
          createdAt: new Date(inversor.createdAt),
          updatedAt: new Date(inversor.updatedAt)
        }
      })
    }

    // Migrar vehículos
    console.log('🚗 Migrando vehículos...')
    for (const vehiculo of vehiculos) {
      await prisma.vehiculo.create({
        data: {
          id: vehiculo.id,
          referencia: vehiculo.referencia,
          marca: vehiculo.marca,
          modelo: vehiculo.modelo,
          matricula: vehiculo.matricula,
          bastidor: vehiculo.bastidor,
          kms: vehiculo.kms,
          tipo: vehiculo.tipo,
          estado: String(vehiculo.estado || 'disponible'),
          orden: vehiculo.orden || 0,
          
          // Campos adicionales de Google Sheets
          fechaMatriculacion: vehiculo.fechaMatriculacion,
          año: vehiculo.año,
          itv: vehiculo.itv,
          seguro: vehiculo.seguro,
          segundaLlave: vehiculo.segundaLlave,
          documentacion: vehiculo.documentacion,
          carpeta: vehiculo.carpeta,
          master: vehiculo.master,
          hojasA: vehiculo.hojasA,
          
          // Campos de inversor
          esCocheInversor: vehiculo.esCocheInversor || false,
          inversorId: vehiculo.inversorId || null,
          fechaCompra: vehiculo.fechaCompra ? new Date(vehiculo.fechaCompra) : null,
          precioCompra: vehiculo.precioCompra,
          gastosTransporte: vehiculo.gastosTransporte,
          gastosTasas: vehiculo.gastosTasas,
          gastosMecanica: vehiculo.gastosMecanica,
          gastosPintura: vehiculo.gastosPintura,
          gastosLimpieza: vehiculo.gastosLimpieza,
          gastosOtros: vehiculo.gastosOtros,
          precioPublicacion: vehiculo.precioPublicacion,
          precioVenta: vehiculo.precioVenta,
          beneficioNeto: vehiculo.beneficioNeto,
          notasInversor: vehiculo.notasInversor,
          fotoInversor: vehiculo.fotoInversor,
          
          createdAt: new Date(vehiculo.createdAt),
          updatedAt: new Date(vehiculo.updatedAt)
        }
      })
    }

    // Migrar clientes
    console.log('👤 Migrando clientes...')
    for (const cliente of clientes) {
      await prisma.cliente.create({
        data: {
          id: cliente.id,
          nombre: cliente.nombre,
          apellidos: cliente.apellidos,
          email: cliente.email,
          telefono: cliente.telefono,
          fechaNacimiento: cliente.fechaNacimiento ? new Date(cliente.fechaNacimiento) : null,
          direccion: cliente.direccion,
          ciudad: cliente.ciudad,
          codigoPostal: cliente.codigoPostal,
          provincia: cliente.provincia,
          dni: cliente.dni,
          fechaRegistro: cliente.fechaRegistro ? new Date(cliente.fechaRegistro) : new Date(),
          vehiculosInteres: cliente.vehiculosInteres,
          presupuestoMaximo: cliente.presupuestoMaximo,
          preferencias: cliente.preferencias,
          notas: cliente.notas,
          activo: cliente.activo !== false,
          createdAt: new Date(cliente.createdAt),
          updatedAt: new Date(cliente.updatedAt)
        }
      })
    }

    // Migrar notas
    console.log('📝 Migrando notas...')
    for (const nota of notas) {
      await prisma.notaCliente.create({
        data: {
          id: nota.id,
          clienteId: nota.clienteId,
          fecha: new Date(nota.fecha),
          tipo: nota.tipo,
          contenido: nota.contenido,
          prioridad: nota.prioridad || 'media',
          completada: nota.completada || false,
          createdAt: new Date(nota.createdAt),
          updatedAt: new Date(nota.updatedAt)
        }
      })
    }

    console.log('✅ Migración completada exitosamente!')
    console.log('')
    console.log('📊 Resumen de la migración:')
    console.log(`   - Inversores: ${inversores.length} ✅`)
    console.log(`   - Vehículos: ${vehiculos.length} ✅`)
    console.log(`   - Clientes: ${clientes.length} ✅`)
    console.log(`   - Notas: ${notas.length} ✅`)
    console.log('')
    console.log('🎉 Tu CRM ahora está usando Supabase!')
    console.log('')
    console.log('📱 Próximos pasos:')
    console.log('   1. Ve a https://supabase.com/dashboard')
    console.log('   2. Abre tu proyecto')
    console.log('   3. Ve a "Table Editor" para ver tus datos')
    console.log('   4. Ejecuta `npx prisma studio` para gestionar datos')
    console.log('')
    console.log('🚀 ¡Listo para producción!')

  } catch (error) {
    console.error('❌ Error durante la migración:', error)
    console.error('')
    console.error('🔧 Posibles soluciones:')
    console.error('   1. Verifica que DATABASE_URL esté configurada en .env.local')
    console.error('   2. Ejecuta `npx prisma db push` primero')
    console.error('   3. Verifica que los archivos JSON existan en /data/')
    console.error('   4. Asegúrate de tener conexión a internet')
    process.exit(1)
  } finally {
    await prisma.$disconnect()
  }
}

// Ejecutar migración
migrateToSupabase()

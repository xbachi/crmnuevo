import { NextRequest, NextResponse } from 'next/server'
import {
  getVehiculos,
  getVehiculosCount,
  saveVehiculo,
  checkUniqueFields,
  updateVehiculo,
  deleteVehiculo,
  getInversores,
} from '@/lib/direct-database'
import { promises as fs } from 'fs'
import { generateFolderName, getFolderPathsByTipo } from '@/config/folders'
import { writeVehiculoToSheets } from '@/lib/googleSheets'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    // console.log('🚗 Recibiendo datos de vehículo:', body)

    const {
      referencia,
      marca,
      modelo,
      matricula,
      bastidor,
      kms,
      tipo,
      tipo_vehiculo,
      color,
      fechaMatriculacion,
      esCocheInversor,
      inversorId,
      fechaCompra,
      precioCompra,
      gastosTransporte,
      gastosTasas,
      gastosMecanica,
      gastosPintura,
      gastosLimpieza,
      gastosOtros,
      precioPublicacion,
      precioVenta,
      beneficioNeto,
      notasInversor,
      fotoInversor,
    } = body

    console.log('🔍 Campos extraídos:', {
      referencia,
      marca,
      modelo,
      matricula,
      bastidor,
      kms,
      tipo,
    })

    // Mapear tipo a letra correspondiente
    const tipoMapping: { [key: string]: string } = {
      Compra: 'C',
      'Coche R': 'R',
      'Deposito Venta': 'D',
      Inversor: 'I',
    }

    const tipoLetra = tipoMapping[tipo] || tipo
    console.log('🔄 Tipo mapeado:', { original: tipo, mapeado: tipoLetra })

    // Validar datos requeridos
    if (
      !referencia ||
      !marca ||
      !modelo ||
      !matricula ||
      !bastidor ||
      !kms ||
      !tipo
    ) {
      console.log('❌ Faltan campos requeridos')
      return NextResponse.json(
        { error: 'Todos los campos son requeridos' },
        { status: 400 }
      )
    }

    // Verificar campos únicos
    const uniqueCheck = await checkUniqueFields(referencia, matricula, bastidor)
    if (uniqueCheck) {
      return NextResponse.json(
        { error: `Ya existe un vehículo con este ${uniqueCheck.field}` },
        { status: 400 }
      )
    }

    // Crear el vehículo en la base de datos
    // console.log('💾 Guardando vehículo en la base de datos...')
    const vehiculo = await saveVehiculo({
      referencia,
      marca,
      modelo,
      matricula,
      bastidor,
      kms: parseInt(kms),
      tipo: tipoLetra,
      tipo_vehiculo: tipo_vehiculo || 'normal',
      color: color || undefined,
      fechaMatriculacion: fechaMatriculacion || undefined,
      esCocheInversor: esCocheInversor || false,
      inversorId: inversorId || undefined,
      fechaCompra: fechaCompra || undefined,
      precioCompra: precioCompra || undefined,
      gastosTransporte: gastosTransporte || undefined,
      gastosTasas: gastosTasas || undefined,
      gastosMecanica: gastosMecanica || undefined,
      gastosPintura: gastosPintura || undefined,
      gastosLimpieza: gastosLimpieza || undefined,
      gastosOtros: gastosOtros || undefined,
      precioPublicacion: precioPublicacion || undefined,
      precioVenta: precioVenta || undefined,
      beneficioNeto: beneficioNeto || undefined,
      notasInversor: notasInversor || undefined,
      fotoInversor: fotoInversor || undefined,
    })
    // console.log('✅ Vehículo guardado:', vehiculo)

    // Crear nombre de carpeta en camelCase
    const folderName = generateFolderName(
      referencia,
      marca,
      modelo,
      matricula,
      tipoLetra
    )

    // Operaciones asíncronas que no bloquean la respuesta
    Promise.all([
      // Crear carpetas en background
      (async () => {
        try {
          const folderPaths = getFolderPathsByTipo(tipoLetra, folderName)
          for (const folderPath of folderPaths) {
            await fs.mkdir(folderPath, { recursive: true })
            console.log(`Carpeta creada: ${folderPath}`)
          }
        } catch (folderError) {
          console.error('Error creando carpetas:', folderError)
        }
      })(),

      // Escribir en Google Sheets en background
      (async () => {
        try {
          await writeVehiculoToSheets(vehiculo)
          // console.log('Vehículo guardado en Google Sheets')
        } catch (sheetsError) {
          console.error('Error guardando en Google Sheets:', sheetsError)
        }
      })(),
    ]).catch((error) => {
      console.error('Error en operaciones background:', error)
    })

    return NextResponse.json({
      success: true,
      vehiculo,
      folderName,
      message: 'Vehículo creado exitosamente',
    })
  } catch (error: any) {
    console.error('Error creando vehículo:', error)

    // Manejar errores específicos de Prisma
    if (error.code === 'P2002') {
      const field = error.meta?.target?.[0] || 'campo'
      return NextResponse.json(
        { error: `Ya existe un vehículo con este ${field}` },
        { status: 400 }
      )
    }

    return NextResponse.json(
      { error: 'Error interno del servidor' },
      { status: 500 }
    )
  }
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const page = parseInt(searchParams.get('page') || '1')
    const limit = parseInt(searchParams.get('limit') || '50')
    const offset = (page - 1) * limit
    const search = searchParams.get('search') || ''
    const tipo = searchParams.get('tipo') || ''

    // console.log(`🚀 Cargando vehículos: página ${page}, límite ${limit}, búsqueda: "${search}", tipo: "${tipo}"`)

    // Obtener vehículos con paginación y filtros
    const [vehiculos, total] = await Promise.all([
      getVehiculos(limit, offset, search, tipo),
      getVehiculosCount(search, tipo),
    ])

    // console.log(`📊 Vehículos cargados: ${vehiculos.length} de ${total} total`)

    const inversores = await getInversores()

    // Crear un mapa de inversores para búsqueda rápida
    const inversoresMap = new Map(inversores.map((inv) => [inv.id, inv.nombre]))

    // Agregar nombre del inversor a los vehículos que lo tengan
    const vehiculosConInversor = vehiculos.map((vehiculo) => ({
      ...vehiculo,
      inversorNombre: vehiculo.inversorId
        ? inversoresMap.get(vehiculo.inversorId)
        : undefined,
    }))

    const response = {
      vehiculos: vehiculosConInversor,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
        hasNext: page * limit < total,
        hasPrev: page > 1,
      },
    }

    return NextResponse.json(response)
  } catch (error) {
    console.error('Error obteniendo vehículos:', error)
    return NextResponse.json(
      { error: 'Error interno del servidor' },
      { status: 500 }
    )
  }
}

export async function PUT(request: NextRequest) {
  try {
    const body = await request.json()
    const {
      id,
      referencia,
      marca,
      modelo,
      matricula,
      bastidor,
      kms,
      tipo,
      color,
      fechaMatriculacion,
      esCocheInversor,
      inversorId,
    } = body

    // Validar campos requeridos
    if (
      !id ||
      !referencia ||
      !marca ||
      !modelo ||
      !matricula ||
      !bastidor ||
      !kms ||
      !tipo
    ) {
      return NextResponse.json(
        { error: 'Todos los campos son requeridos' },
        { status: 400 }
      )
    }

    // Verificar que el vehículo existe
    const vehiculos = await getVehiculos()
    const vehiculoExistente = vehiculos.find((v) => v.id === id)
    if (!vehiculoExistente) {
      return NextResponse.json(
        { error: 'Vehículo no encontrado' },
        { status: 404 }
      )
    }

    // Verificar campos únicos (excluyendo el vehículo actual)
    const uniqueCheck = await checkUniqueFields(
      referencia,
      matricula,
      bastidor,
      id
    )

    if (uniqueCheck) {
      return NextResponse.json(
        { error: `Ya existe un vehículo con este ${uniqueCheck.field}` },
        { status: 400 }
      )
    }

    // Actualizar el vehículo
    const vehiculoActualizado = await updateVehiculo(id, {
      referencia,
      marca,
      modelo,
      matricula,
      bastidor,
      kms: parseInt(kms),
      tipo,
      color: color || undefined,
      fechaMatriculacion: fechaMatriculacion || undefined,
      esCocheInversor: esCocheInversor || false,
      inversorId: inversorId || undefined,
    })

    return NextResponse.json({
      success: true,
      vehiculo: vehiculoActualizado,
      message: 'Vehículo actualizado exitosamente',
    })
  } catch (error: any) {
    console.error('Error actualizando vehículo:', error)
    return NextResponse.json(
      { error: 'Error al actualizar el vehículo' },
      { status: 500 }
    )
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const id = parseInt(searchParams.get('id') || '0')

    if (!id) {
      return NextResponse.json(
        { error: 'ID del vehículo es requerido' },
        { status: 400 }
      )
    }

    // Verificar que el vehículo existe
    const vehiculos = await getVehiculos()
    const vehiculoExistente = vehiculos.find((v) => v.id === id)
    if (!vehiculoExistente) {
      return NextResponse.json(
        { error: 'Vehículo no encontrado' },
        { status: 404 }
      )
    }

    // Eliminar el vehículo
    await deleteVehiculo(id)

    return NextResponse.json({
      success: true,
      message: 'Vehículo eliminado exitosamente',
    })
  } catch (error: any) {
    console.error('Error eliminando vehículo:', error)
    return NextResponse.json(
      { error: 'Error al eliminar el vehículo' },
      { status: 500 }
    )
  }
}

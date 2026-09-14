import { NextRequest, NextResponse } from 'next/server'
import {
  getVehiculos,
  getVehiculosCount,
  saveVehiculo,
  checkUniqueFields,
  updateVehiculo,
  deleteVehiculo,
  getInversores,
  type Vehiculo,
} from '@/lib/direct-database'
import { promises as fs } from 'fs'
import { generateFolderName, getFolderPathsByTipo } from '@/config/folders'
import { encolarSheetsVehiculo } from '@/lib/sheetsVehiculo'
import { guardarFicha, validarFicha } from '@/lib/fichaComercial'
import { normalizarTipo } from '@/lib/vehiculoEstado'
import {
  extraerMatriculaEntrada,
  normalizarReferencia,
  validarMatricula,
} from '@/lib/normalizacion'

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
      proveedor,
      abonado,
      comprobante,
      porteSolicitado,
      recibidoTexto,
      fichaComercial,
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

    // Mapear tipo a la letra canónica (único punto de traducción palabra→letra)
    const tipoLetra = normalizarTipo(tipo)
    if (!tipoLetra) {
      return NextResponse.json(
        { error: `Tipo de vehículo no reconocido: '${tipo}'` },
        { status: 400 }
      )
    }
    console.log('🔄 Tipo mapeado:', { original: tipo, mapeado: tipoLetra })

    const referenciaCanon = normalizarReferencia(referencia, tipoLetra)
    if (!referenciaCanon) {
      return NextResponse.json(
        {
          error: `Referencia no reconocida: '${referencia}' (esperado #1088, #D-28 o #R-11)`,
        },
        { status: 400 }
      )
    }
    const matriculaNorm = extraerMatriculaEntrada(matricula)
    const val = validarMatricula(matriculaNorm, {
      extranjera: body.matriculaExtranjera === true,
    })
    if (!val.ok) {
      return NextResponse.json(
        {
          error: `Matrícula '${matricula}' no válida (formato 1234BCD o V-1234-GT). Si es extranjera, marca matriculaExtranjera.`,
        },
        { status: 400 }
      )
    }

    // Verificar campos únicos
    const uniqueCheck = await checkUniqueFields(
      referenciaCanon,
      matriculaNorm,
      bastidor
    )
    if (uniqueCheck) {
      return NextResponse.json(
        { error: `Ya existe un vehículo con este ${uniqueCheck.field}` },
        { status: 400 }
      )
    }

    // Crear el vehículo en la base de datos
    // console.log('💾 Guardando vehículo en la base de datos...')
    const vehiculo = await saveVehiculo({
      referencia: referenciaCanon,
      marca,
      modelo,
      matricula: matriculaNorm,
      bastidor,
      kms: parseInt(kms),
      tipo: tipoLetra,
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
      proveedor: proveedor || undefined,
      abonado: abonado || undefined,
      comprobante: comprobante || undefined,
      porteSolicitado: porteSolicitado || undefined,
      recibidoTexto: recibidoTexto || undefined,
    } as Omit<Vehiculo, 'id' | 'createdAt' | 'updatedAt'>)
    // console.log('✅ Vehículo guardado:', vehiculo)

    // Crear nombre de carpeta en camelCase
    const folderName = generateFolderName(
      referenciaCanon,
      marca,
      modelo,
      matriculaNorm,
      tipoLetra
    )

    // Ficha comercial (web y presupuesto) del alta; un fallo no deshace el alta.
    if (fichaComercial && typeof fichaComercial === 'object') {
      try {
        const val = validarFicha(fichaComercial)
        if (val.ok && Object.keys(val.patch).length > 0) {
          await guardarFicha(vehiculo.id, val.patch)
        } else if (!val.ok) {
          console.warn('ficha comercial ignorada:', val.errores.join('; '))
        }
      } catch (err) {
        console.error(
          'guardar ficha comercial:',
          (err as Error)?.message ?? err
        )
      }
    }

    // Encolar la hoja ANTES de responder: el INSERT en el outbox es barato y
    // fuera de la request la lambda puede congelarse antes de hacerlo.
    try {
      await encolarSheetsVehiculo(vehiculo.id, 'create')
    } catch (sheetsError) {
      console.error('Error encolando Google Sheets:', sheetsError)
    }

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

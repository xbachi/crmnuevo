import { NextRequest, NextResponse } from 'next/server'
import { VehiculoService } from '@/lib/database-optimized'
import { writeVehiculoToSheets } from '@/lib/googleSheets'
import { generateFolderName, getFolderPathsByTipo } from '@/config/folders'
import { promises as fs } from 'fs'

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    
    const page = parseInt(searchParams.get('page') || '1')
    const limit = parseInt(searchParams.get('limit') || '20')
    const search = searchParams.get('search') || undefined
    const tipo = searchParams.get('tipo') || undefined
    const estado = searchParams.get('estado') || undefined
    const inversorId = searchParams.get('inversorId') ? parseInt(searchParams.get('inversorId')!) : undefined
    const orderBy = searchParams.get('orderBy') || 'createdAt'
    const orderDirection = (searchParams.get('orderDirection') || 'desc') as 'asc' | 'desc'

    const result = await VehiculoService.getVehiculos({
      page,
      limit,
      search,
      tipo,
      estado,
      inversorId,
      orderBy,
      orderDirection
    })

    return NextResponse.json(result)
  } catch (error) {
    console.error('Error obteniendo vehículos:', error)
    return NextResponse.json(
      { error: 'Error interno del servidor' },
      { status: 500 }
    )
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { 
      referencia, 
      marca, 
      modelo, 
      matricula, 
      bastidor, 
      kms, 
      tipo,
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
      fotoInversor
    } = body

    // Validar datos requeridos
    if (!referencia || !marca || !modelo || !matricula || !bastidor || !kms || !tipo) {
      return NextResponse.json(
        { error: 'Todos los campos son requeridos' },
        { status: 400 }
      )
    }

    // Verificar campos únicos
    const uniqueCheck = await VehiculoService.checkUniqueFields(referencia, matricula, bastidor)
    if (uniqueCheck) {
      return NextResponse.json(
        { error: `Ya existe un vehículo con este ${uniqueCheck.field}` },
        { status: 400 }
      )
    }

    // Preparar datos para crear
    const vehiculoData = {
      referencia,
      marca,
      modelo,
      matricula,
      bastidor,
      kms: parseInt(kms),
      tipo,
      esCocheInversor: esCocheInversor || false,
      inversorId: inversorId ? parseInt(inversorId) : null,
      fechaCompra,
      precioCompra: precioCompra ? parseFloat(precioCompra) : null,
      gastosTransporte: gastosTransporte ? parseFloat(gastosTransporte) : null,
      gastosTasas: gastosTasas ? parseFloat(gastosTasas) : null,
      gastosMecanica: gastosMecanica ? parseFloat(gastosMecanica) : null,
      gastosPintura: gastosPintura ? parseFloat(gastosPintura) : null,
      gastosLimpieza: gastosLimpieza ? parseFloat(gastosLimpieza) : null,
      gastosOtros: gastosOtros ? parseFloat(gastosOtros) : null,
      precioPublicacion: precioPublicacion ? parseFloat(precioPublicacion) : null,
      precioVenta: precioVenta ? parseFloat(precioVenta) : null,
      beneficioNeto: beneficioNeto ? parseFloat(beneficioNeto) : null,
      notasInversor,
      fotoInversor
    }

    // Crear el vehículo en la base de datos
    const vehiculo = await VehiculoService.createVehiculo(vehiculoData)

    // Crear carpetas del vehículo
    try {
      const folderName = generateFolderName(referencia, marca, modelo, matricula, tipo)
      const folderPaths = getFolderPathsByTipo(tipo)
      
      for (const folderPath of folderPaths) {
        const fullPath = `./${folderPath}/${folderName}`
        await fs.mkdir(fullPath, { recursive: true })
      }
    } catch (folderError) {
      console.error('Error creando carpetas:', folderError)
      // No fallar la operación por errores de carpetas
    }

    // Sincronizar con Google Sheets (opcional)
    try {
      await writeVehiculoToSheets({
        referencia,
        marca,
        modelo,
        matricula,
        bastidor,
        kms: kms.toString()
      })
    } catch (sheetsError) {
      console.error('Error sincronizando con Google Sheets:', sheetsError)
      // No fallar la operación por errores de Google Sheets
    }


    return NextResponse.json({
      success: true,
      vehiculo,
      message: 'Vehículo creado exitosamente'
    })
  } catch (error) {
    console.error('Error creando vehículo:', error)
    return NextResponse.json(
      { error: 'Error interno del servidor' },
      { status: 500 }
    )
  }
}

export async function PUT(request: NextRequest) {
  try {
    const body = await request.json()
    const { id, ...updateData } = body

    if (!id) {
      return NextResponse.json(
        { error: 'ID del vehículo es requerido' },
        { status: 400 }
      )
    }

    const vehiculo = await VehiculoService.updateVehiculo(id, updateData)


    return NextResponse.json({
      success: true,
      vehiculo,
      message: 'Vehículo actualizado exitosamente'
    })
  } catch (error) {
    console.error('Error actualizando vehículo:', error)
    return NextResponse.json(
      { error: 'Error interno del servidor' },
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

    await VehiculoService.deleteVehiculo(id)


    return NextResponse.json({
      success: true,
      message: 'Vehículo eliminado exitosamente'
    })
  } catch (error) {
    console.error('Error eliminando vehículo:', error)
    return NextResponse.json(
      { error: 'Error interno del servidor' },
      { status: 500 }
    )
  }
}

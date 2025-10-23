import { NextRequest, NextResponse } from 'next/server'
import { Pool } from 'pg'
import { generarContratoCocheR } from '@/lib/cocheRContractGenerator'
import { capitalizeText } from '@/lib/utils'
import { getClienteById } from '@/lib/direct-database'

// Crear pool de conexiones PostgreSQL
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false,
  },
})

export async function POST(request: NextRequest) {
  try {
    const { vehiculoId, clienteId, precioVenta } = await request.json()

    console.log(
      `📄 [COCHE R CONTRATO] Generando contrato para vehículo ${vehiculoId}, cliente ${clienteId}`
    )

    if (!vehiculoId || !clienteId || !precioVenta) {
      return NextResponse.json(
        { error: 'Faltan parámetros requeridos' },
        { status: 400 }
      )
    }

    const client = await pool.connect()

    try {
      // Obtener datos del vehículo
      const vehiculoResult = await client.query(
        `SELECT marca, modelo, año, matricula, bastidor, kms, "fechaMatriculacion"
         FROM "Vehiculo" 
         WHERE id = $1 AND tipo = 'R'`,
        [parseInt(vehiculoId)]
      )

      if (vehiculoResult.rows.length === 0) {
        return NextResponse.json(
          { error: 'Coche R no encontrado' },
          { status: 404 }
        )
      }

      // Obtener datos del cliente usando la función existente
      const cliente = await getClienteById(parseInt(clienteId))

      if (!cliente) {
        return NextResponse.json(
          { error: 'Cliente no encontrado' },
          { status: 404 }
        )
      }

      const vehiculo = vehiculoResult.rows[0]

      // Generar el PDF
      console.log('📄 [CONTRATO] Generando PDF con datos:', {
        vehiculo: {
          marca: vehiculo.marca,
          modelo: vehiculo.modelo,
          año: vehiculo.año,
          matricula: vehiculo.matricula,
          bastidor: vehiculo.bastidor,
          kilometraje: vehiculo.kms,
          fechaMatriculacion: vehiculo.fechaMatriculacion,
        },
        cliente: {
          nombre: capitalizeText(cliente.nombre),
          apellidos: capitalizeText(cliente.apellidos),
          dni: cliente.dni,
          direccion: cliente.direccion || 'No especificada',
        },
        precioVenta: parseFloat(precioVenta),
      })

      const pdfBuffer = await generarContratoCocheR({
        vehiculo: {
          marca: vehiculo.marca,
          modelo: vehiculo.modelo,
          año: vehiculo.año,
          matricula: vehiculo.matricula,
          bastidor: vehiculo.bastidor,
          kilometraje: vehiculo.kms,
          fechaMatriculacion: vehiculo.fechaMatriculacion,
        },
        cliente: {
          nombre: capitalizeText(cliente.nombre),
          apellidos: capitalizeText(cliente.apellidos),
          dni: cliente.dni,
          direccion: cliente.direccion || 'No especificada',
        },
        precioVenta: parseFloat(precioVenta),
      })

      console.log(
        '📄 [CONTRATO] PDF generado, tamaño:',
        pdfBuffer.length,
        'bytes'
      )

      console.log(`✅ [COCHE R CONTRATO] Contrato generado exitosamente`)

      // Siempre devolver el PDF directamente como lo hacen los otros contratos
      return new NextResponse(pdfBuffer, {
        status: 200,
        headers: {
          'Content-Type': 'application/pdf',
          'Content-Disposition': `attachment; filename="contrato-coche-r-${vehiculoId}.pdf"`,
          'Content-Length': pdfBuffer.length.toString(),
        },
      })
    } finally {
      client.release()
    }
  } catch (error) {
    console.error('❌ [COCHE R CONTRATO] Error generando contrato:', error)
    console.error(
      '❌ [COCHE R CONTRATO] Stack trace:',
      error instanceof Error ? error.stack : 'No stack trace'
    )
    return NextResponse.json(
      {
        error: 'Error interno del servidor',
        details: error instanceof Error ? error.message : 'Error desconocido',
      },
      { status: 500 }
    )
  }
}

import { NextRequest, NextResponse } from 'next/server'
import { Pool } from 'pg'
import { generarContratoCocheR } from '@/lib/cocheRContractGenerator'
import { capitalizeText } from '@/lib/utils'

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
        `SELECT marca, modelo, año, matricula, bastidor, kilometraje
         FROM "Vehiculo" 
         WHERE id = $1 AND tipo_vehiculo = 'coche_r'`,
        [parseInt(vehiculoId)]
      )

      if (vehiculoResult.rows.length === 0) {
        return NextResponse.json(
          { error: 'Coche R no encontrado' },
          { status: 404 }
        )
      }

      // Obtener datos del cliente
      const clienteResult = await client.query(
        `SELECT nombre, apellidos, dni, direccion
         FROM "Cliente" 
         WHERE id = $1`,
        [parseInt(clienteId)]
      )

      if (clienteResult.rows.length === 0) {
        return NextResponse.json(
          { error: 'Cliente no encontrado' },
          { status: 404 }
        )
      }

      const vehiculo = vehiculoResult.rows[0]
      const cliente = clienteResult.rows[0]

      // Generar el PDF
      const pdfBuffer = await generarContratoCocheR({
        vehiculo: {
          marca: vehiculo.marca,
          modelo: vehiculo.modelo,
          año: vehiculo.año,
          matricula: vehiculo.matricula,
          bastidor: vehiculo.bastidor,
          kilometraje: vehiculo.kilometraje,
        },
        cliente: {
          nombre: capitalizeText(cliente.nombre),
          apellidos: capitalizeText(cliente.apellidos),
          dni: cliente.dni,
          direccion: cliente.direccion,
        },
        precioVenta: parseFloat(precioVenta),
      })

      console.log(`✅ [COCHE R CONTRATO] Contrato generado exitosamente`)

      // En Vercel, devolver el PDF directamente
      if (process.env.VERCEL) {
        return new NextResponse(pdfBuffer, {
          status: 200,
          headers: {
            'Content-Type': 'application/pdf',
            'Content-Disposition': `attachment; filename="contrato-coche-r-${vehiculoId}.pdf"`,
            'Content-Length': pdfBuffer.length.toString(),
          },
        })
      }

      // En desarrollo local, guardar el archivo
      const fs = require('fs')
      const path = require('path')

      const filename = `contrato-coche-r-${vehiculoId}-${Date.now()}.pdf`
      const filepath = path.join(process.cwd(), 'public', 'documents', filename)

      // Crear directorio si no existe
      const dir = path.dirname(filepath)
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true })
      }

      fs.writeFileSync(filepath, pdfBuffer)

      return NextResponse.json({
        success: true,
        filename,
        url: `/documents/${filename}`,
      })
    } finally {
      client.release()
    }
  } catch (error) {
    console.error('❌ [COCHE R CONTRATO] Error generando contrato:', error)
    return NextResponse.json(
      { error: 'Error interno del servidor' },
      { status: 500 }
    )
  }
}

import { NextRequest, NextResponse } from 'next/server'
import { writeVehiculoToSheets } from '@/lib/googleSheets'

export async function POST(request: NextRequest) {
  try {
    // Datos de prueba
    const vehiculoTest = {
      referencia: '#9999',
      marca: 'Test',
      modelo: 'Prueba',
      matricula: 'TEST1234',
      bastidor: 'TEST123456789',
      kms: 0,
      tipo: 'Compra',
      createdAt: new Date(),
      updatedAt: new Date()
    }

    await writeVehiculoToSheets(vehiculoTest)
    
    return NextResponse.json({ 
      success: true, 
      message: 'Vehículo de prueba guardado exitosamente en Google Sheets' 
    })
  } catch (error: any) {
    console.error('Error testing Google Sheets:', error)
    return NextResponse.json({ 
      success: false, 
      error: error.message 
    }, { status: 500 })
  }
}

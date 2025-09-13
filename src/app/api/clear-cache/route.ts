import { NextResponse } from 'next/server'

export async function POST() {
  try {
    // Esta API no hace nada en el servidor, pero el frontend la usará
    // para confirmar que debe limpiar su cache local
    return NextResponse.json({
      success: true,
      message: 'Cache cleared successfully'
    })
  } catch (error) {
    return NextResponse.json(
      { error: 'Error clearing cache' },
      { status: 500 }
    )
  }
}

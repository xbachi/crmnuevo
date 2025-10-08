import { NextRequest, NextResponse } from 'next/server'

export async function GET(request: NextRequest) {
  try {
    console.log('🔍 [TEST VERCEL] Iniciando test de Vercel...')

    // Test 1: Verificar entorno
    const envInfo = {
      isVercel: !!process.env.VERCEL,
      nodeEnv: process.env.NODE_ENV,
      vercelUrl: process.env.VERCEL_URL,
      nodeVersion: process.version,
    }

    console.log('🔍 [TEST VERCEL] Info del entorno:', envInfo)

    // Test 2: Verificar canvas
    let canvasInfo = null
    try {
      const { createCanvas } = require('canvas')
      const canvas = createCanvas(100, 100)
      canvasInfo = {
        available: true,
        width: canvas.width,
        height: canvas.height,
      }
      console.log('✅ [TEST VERCEL] Canvas disponible:', canvasInfo)
    } catch (canvasError) {
      canvasInfo = {
        available: false,
        error: (canvasError as Error).message,
      }
      console.error('❌ [TEST VERCEL] Canvas no disponible:', canvasError)
    }

    // Test 3: Verificar jsPDF
    let jsPDFInfo = null
    try {
      const jsPDF = require('jspdf')
      const doc = new jsPDF()
      jsPDFInfo = {
        available: true,
        version: jsPDF.version || 'unknown',
      }
      console.log('✅ [TEST VERCEL] jsPDF disponible:', jsPDFInfo)
    } catch (jsPDFError) {
      jsPDFInfo = {
        available: false,
        error: (jsPDFError as Error).message,
      }
      console.error('❌ [TEST VERCEL] jsPDF no disponible:', jsPDFError)
    }

    // Test 4: Verificar fetch
    let fetchInfo = null
    try {
      // Verificar si fetch está disponible y funciona
      const testResponse = await fetch('https://httpbin.org/json')
      fetchInfo = {
        available: true,
        status: testResponse.status,
        ok: testResponse.ok,
      }
      console.log('✅ [TEST VERCEL] Fetch disponible:', fetchInfo)
    } catch (fetchError) {
      fetchInfo = {
        available: false,
        error: (fetchError as Error).message,
      }
      console.error('❌ [TEST VERCEL] Fetch no disponible:', fetchError)
    }

    const result = {
      success: true,
      timestamp: new Date().toISOString(),
      environment: envInfo,
      canvas: canvasInfo,
      jsPDF: jsPDFInfo,
      fetch: fetchInfo,
    }

    console.log('✅ [TEST VERCEL] Test completado:', result)

    return NextResponse.json(result)
  } catch (error) {
    console.error('❌ [TEST VERCEL] Error en test:', error)
    return NextResponse.json(
      {
        success: false,
        error: (error as Error).message,
        stack: (error as Error).stack,
      },
      { status: 500 }
    )
  }
}

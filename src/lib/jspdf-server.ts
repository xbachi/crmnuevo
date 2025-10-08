// Configuración específica de jsPDF para servidor
import jsPDF from 'jspdf'

// Configurar jsPDF para el entorno de servidor
if (typeof window === 'undefined') {
  try {
    // Intentar cargar canvas de forma más segura
    let canvas: any = null

    try {
      const canvasModule = require('canvas')
      canvas = canvasModule.createCanvas
      console.log('✅ Canvas cargado correctamente')
    } catch (canvasError) {
      console.warn('⚠️ Canvas no disponible:', (canvasError as Error).message)
    }

    // Configurar jsPDF solo si canvas está disponible
    if (canvas && jsPDF.prototype) {
      jsPDF.prototype.canvas = canvas
      console.log('✅ jsPDF configurado para servidor con canvas')
    } else {
      console.log('ℹ️ jsPDF funcionará sin canvas (modo básico)')
    }

    // Configuración adicional para Vercel
    if (process.env.VERCEL) {
      console.log('🌐 Ejecutándose en Vercel')

      // Configurar polyfills para Vercel si es necesario
      if (typeof global !== 'undefined') {
        global.Blob =
          global.Blob ||
          class Blob {
            constructor(parts: any[], options: any) {
              this.parts = parts
              this.options = options || {}
            }
            parts: any[]
            options: any
          }
      }
    }
  } catch (error) {
    console.error('❌ Error configurando jsPDF:', (error as Error).message)
    console.error('❌ Stack trace:', (error as Error).stack)
  }
}

export { jsPDF }
export default jsPDF

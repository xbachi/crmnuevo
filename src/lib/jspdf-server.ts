// Configuración específica de jsPDF para servidor
import jsPDF from 'jspdf'

// Configurar jsPDF para el entorno de servidor
if (typeof window === 'undefined') {
  try {
    // Configuración para Vercel - sin canvas
    if (process.env.VERCEL) {
      console.log('🌐 Ejecutándose en Vercel - modo sin canvas')

      // Configurar polyfills básicos para Vercel
      if (typeof global !== 'undefined') {
        // Polyfill para Blob
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

        // Polyfill para File
        global.File =
          global.File ||
          class File extends Blob {
            constructor(parts: any[], filename: string, options: any) {
              super(parts, options)
              this.name = filename
              this.lastModified = Date.now()
            }
            name: string
            lastModified: number
          }
      }
    }

    console.log('✅ jsPDF configurado para servidor (modo básico)')
  } catch (error) {
    console.error('❌ Error configurando jsPDF:', (error as Error).message)
  }
}

export { jsPDF }
export default jsPDF

// Configuración específica de jsPDF para servidor
import jsPDF from 'jspdf'

// Configurar jsPDF para el entorno de servidor
if (typeof window === 'undefined') {
  try {
    // Intentar cargar canvas
    const { createCanvas } = require('canvas')

    // Configurar jsPDF para usar canvas en Node.js
    if (jsPDF.prototype) {
      jsPDF.prototype.canvas = createCanvas
      console.log('✅ jsPDF configurado para servidor con canvas')
    }
  } catch (error) {
    console.warn(
      '⚠️ Canvas no disponible en el servidor:',
      (error as Error).message
    )

    // Fallback: usar configuración mínima
    try {
      console.log('🔄 Usando configuración mínima de jsPDF...')
      // jsPDF debería funcionar sin canvas para operaciones básicas
    } catch (fallbackError) {
      console.error(
        '❌ Error en configuración mínima:',
        (fallbackError as Error).message
      )
    }
  }
}

export { jsPDF }
export default jsPDF

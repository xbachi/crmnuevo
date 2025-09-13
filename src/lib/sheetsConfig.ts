// Configuración de las hojas de Google Sheets
export const SHEETS_CONFIG = {
  // IDs de las hojas de cálculo separadas (REALES)
  SPREADSHEET_IDS: {
    VENTAS: '1RwnqBYlPMXj2rUJ3XqegrSQ-kM5RIJG61uGALy-pEH8',
    COMPRAS: '1asyKq66_4_GUwkYQdgjSIOLR5wY3ur06ebgleFFWiW0'
  },
  
  // Nombres de las hojas dentro de cada spreadsheet según el tipo
  SHEET_NAMES: {
    VENTAS: {
      'Compra': 'Expo',           // Tipo "Compra" → Hoja "Expo"
      'Coche R': 'R',             // Tipo "Coche R" → Hoja "R" 
      'Deposito Venta': 'Deposito' // Tipo "Deposito Venta" → Hoja "Deposito"
    },
    COMPRAS: {
      'Compra': 'Compras',        // Tipo "Compra" → Hoja "Compras"
      'Coche R': 'R',             // Tipo "Coche R" → Hoja "R"
      'Deposito Venta': 'Deposito' // Tipo "Deposito Venta" → Hoja "Deposito"
    }
  },
  
  // Encabezados de las columnas (REALES)
  HEADERS: [
    'REFERENCIA',
    'MARCA', 
    'MODELO',
    'MATRICULA',
    'BASTIDOR',
    'KMS'
  ],

  
  // Configuración de formato de datos
  DATA_FORMAT: {
    // Formato de fecha
    DATE_FORMAT: 'DD/MM/YYYY HH:mm:ss',
    
    // Formato de números
    NUMBER_FORMAT: {
      KMS: '0' // Sin decimales para KMs
    }
  }
}

// Función para validar configuración
export function validateSheetsConfig() {
  const requiredEnvVars = [
    'GOOGLE_SERVICE_ACCOUNT_EMAIL',
    'GOOGLE_PRIVATE_KEY'
  ]
  
  const missingVars = requiredEnvVars.filter(varName => !process.env[varName])
  
  if (missingVars.length > 0) {
    throw new Error(`Missing required environment variables: ${missingVars.join(', ')}`)
  }
  
  return true
}

const fs = require('fs')
const path = require('path')

const DATA_DIR = path.join(__dirname, '../data')
const VEHICULOS_FILE = path.join(DATA_DIR, 'vehiculos.json')

async function clearVehiculos() {
  try {
    console.log('🧹 Limpiando vehículos de la base de datos...')
    
    // Crear array vacío de vehículos
    const vehiculosVacios = []
    
    // Escribir el archivo vacío
    await fs.promises.writeFile(VEHICULOS_FILE, JSON.stringify(vehiculosVacios, null, 2))
    
    console.log('✅ Base de datos de vehículos limpiada exitosamente')
    console.log(`📁 Archivo: ${VEHICULOS_FILE}`)
    console.log(`📊 Total de vehículos: 0`)
    
  } catch (error) {
    console.error('❌ Error limpiando vehículos:', error)
    process.exit(1)
  }
}

clearVehiculos()

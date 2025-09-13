const fs = require('fs')
const path = require('path')

const DATA_DIR = path.join(__dirname, '../data')

async function clearAllData() {
  try {
    console.log('🧹 Limpiando toda la base de datos...')
    
    // Limpiar vehículos
    const vehiculosFile = path.join(DATA_DIR, 'vehiculos.json')
    await fs.promises.writeFile(vehiculosFile, JSON.stringify([], null, 2))
    console.log('✅ Vehículos limpiados')
    
    // Limpiar clientes
    const clientesFile = path.join(DATA_DIR, 'clientes.json')
    await fs.promises.writeFile(clientesFile, JSON.stringify([], null, 2))
    console.log('✅ Clientes limpiados')
    
    // Limpiar inversores
    const inversoresFile = path.join(DATA_DIR, 'inversores.json')
    await fs.promises.writeFile(inversoresFile, JSON.stringify([], null, 2))
    console.log('✅ Inversores limpiados')
    
    // Limpiar notas de clientes
    const notasFile = path.join(DATA_DIR, 'notas_clientes.json')
    await fs.promises.writeFile(notasFile, JSON.stringify([], null, 2))
    console.log('✅ Notas de clientes limpiadas')
    
    console.log('🎉 Base de datos completamente limpia')
    console.log('📋 Ahora puedes importar tu nuevo CSV')
    
  } catch (error) {
    console.error('❌ Error limpiando datos:', error)
    process.exit(1)
  }
}

clearAllData()

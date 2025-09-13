// Configuración de rutas para carpetas de vehículos según tipo
export const FOLDER_PATHS = {
  // Compra
  COMPRA: {
    COMPRAS: '\\\\SERVIDOR\\Sevencars\\1_Privado\\0_Manual_Operaciones\\3_Compras',
    VENTAS: '\\\\SERVIDOR\\Sevencars\\1_Privado\\0_Manual_Operaciones\\1_Ventas'
  },
  // Coche R
  COCHE_R: {
    VENTAS: '\\\\SERVIDOR\\Sevencars\\1_Privado\\0_Manual_Operaciones\\1_Ventas\\-----------Coches R',
    COMPRAS: '\\\\SERVIDOR\\Sevencars\\1_Privado\\0_Manual_Operaciones\\3_Compras\\-----------Coches R'
  },
  // Deposito Venta (Consignación)
  DEPOSITO_VENTA: {
    COMPRAS: '\\\\SERVIDOR\\Sevencars\\1_Privado\\0_Manual_Operaciones\\3_Compras\\###Consignacion',
    VENTAS: '\\\\SERVIDOR\\Sevencars\\1_Privado\\0_Manual_Operaciones\\1_Ventas\\-------Consignacion'
  }
}

export function generateFolderName(referencia: string, marca: string, modelo: string, matricula: string, tipo?: string): string {
  let numeroCarpeta: string
  
  // Si es Coche R, usar formato especial R-XX
  if (tipo === 'Coche R') {
    const numero = referencia.replace(/^#?R?/i, '') // Remover #, R si existen
    const numeroValido = numero || '0' // Si no hay número, usar '0'
    numeroCarpeta = `R-${numeroValido.padStart(2, '0')}` // Formato R-XX
  } else if (tipo === 'Deposito Venta') {
    // Si es Deposito Venta, usar formato especial D-XX
    const numero = referencia.replace(/^#?D?/i, '') // Remover #, D si existen
    const numeroValido = numero || '0' // Si no hay número, usar '0'
    numeroCarpeta = `D-${numeroValido.padStart(2, '0')}` // Formato D-XX
  } else {
    // Extraer el número de la referencia para otros tipos
    const referenciaNum = parseInt(referencia.replace('#', ''))
    
    if (referenciaNum >= 1000 && referenciaNum <= 1099) {
      // 1000-1099: Solo últimos 2 dígitos (00, 01, 02... 99)
      numeroCarpeta = (referenciaNum % 100).toString().padStart(2, '0')
    } else if (referenciaNum >= 1100 && referenciaNum <= 1199) {
      // 1100-1199: Agregar "1" delante (100, 101, 102... 199)
      numeroCarpeta = '1' + (referenciaNum % 100).toString().padStart(2, '0')
    } else {
      // Para otros rangos, usar solo últimos 2 dígitos
      numeroCarpeta = (referenciaNum % 100).toString().padStart(2, '0')
    }
  }
  
  // Convertir a CamelCase: primera letra de cada palabra en mayúscula
  const marcaCamelCase = marca.toLowerCase().replace(/\b\w/g, l => l.toUpperCase())
  const modeloCamelCase = modelo.toLowerCase().replace(/\b\w/g, l => l.toUpperCase())
  
  // Matrícula en mayúsculas
  const matriculaMayuscula = matricula.toUpperCase()
  
  // Crear nombre de carpeta con formato: NumeroCarpeta-Marca-Modelo-Matricula
  return `${numeroCarpeta}-${marcaCamelCase}-${modeloCamelCase}-${matriculaMayuscula}`
}

export function getFolderPathsByTipo(tipo: string, folderName: string): string[] {
  switch (tipo) {
    case 'Compra':
      return [
        `${FOLDER_PATHS.COMPRA.COMPRAS}\\${folderName}`,
        `${FOLDER_PATHS.COMPRA.VENTAS}\\${folderName}`
      ]
    case 'Coche R':
      return [
        `${FOLDER_PATHS.COCHE_R.VENTAS}\\${folderName}`,
        `${FOLDER_PATHS.COCHE_R.COMPRAS}\\${folderName}`
      ]
    case 'Deposito Venta':
      return [
        `${FOLDER_PATHS.DEPOSITO_VENTA.COMPRAS}\\${folderName}`,
        `${FOLDER_PATHS.DEPOSITO_VENTA.VENTAS}\\${folderName}`
      ]
    default:
      return []
  }
}

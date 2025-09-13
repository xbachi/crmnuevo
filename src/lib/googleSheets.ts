import { google } from 'googleapis'
import { SHEETS_CONFIG, validateSheetsConfig } from './sheetsConfig'

// Configuración de Google Sheets
const SCOPES = ['https://www.googleapis.com/auth/spreadsheets']

// Función para autenticar con Google Sheets
export async function getGoogleSheetsAuth() {
  try {
    // Validar configuración
    validateSheetsConfig()

    // Crear cliente de autenticación
    const auth = new google.auth.GoogleAuth({
      credentials: {
        client_email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
        private_key: process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, '\n'),
      },
      scopes: SCOPES,
    })

    return auth
  } catch (error) {
    console.error('Error authenticating with Google Sheets:', error)
    throw error
  }
}

// Función para obtener el ID de una hoja por nombre
async function getSheetId(spreadsheetId: string, sheetName: string): Promise<number> {
  try {
    const auth = await getGoogleSheetsAuth()
    const sheets = google.sheets({ version: 'v4', auth })

    const response = await sheets.spreadsheets.get({
      spreadsheetId
    })

    const sheet = response.data.sheets?.find(s => s.properties?.title === sheetName)
    if (!sheet?.properties?.sheetId) {
      throw new Error(`Hoja '${sheetName}' no encontrada`)
    }

    return sheet.properties.sheetId
  } catch (error) {
    console.error(`Error getting sheet ID for ${sheetName}:`, error)
    throw error
  }
}

// Función para obtener las posiciones de las columnas en una hoja
async function getColumnPositions(spreadsheetId: string, sheetName: string, sheetType: 'VENTAS' | 'COMPRAS') {
  try {
    const auth = await getGoogleSheetsAuth()
    const sheets = google.sheets({ version: 'v4', auth })

    // Obtener la primera fila (encabezados)
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: `${sheetName}!1:1`,
    })

    const headers = response.data.values?.[0] || []
    
    // Buscar las posiciones de las columnas requeridas
    const positions = {
      REFERENCIA: headers.findIndex(h => h?.toString().toUpperCase().includes('REFERENCIA')),
      MARCA: headers.findIndex(h => h?.toString().toUpperCase().includes('MARCA')),
      MODELO: headers.findIndex(h => h?.toString().toUpperCase().includes('MODELO')),
      MATRICULA: headers.findIndex(h => h?.toString().toUpperCase().includes('MATRICULA')),
      BASTIDOR: headers.findIndex(h => h?.toString().toUpperCase().includes('BASTIDOR')),
      KMS: headers.findIndex(h => h?.toString().toUpperCase().includes('KMS'))
    }


    console.log(`Posiciones de columnas en ${sheetName}:`, positions)
    return positions
  } catch (error) {
    console.error(`Error getting column positions for ${sheetName}:`, error)
    throw error
  }
}

// Función para escribir datos en Google Sheets con posiciones específicas
export async function writeToGoogleSheets(
  spreadsheetId: string,
  sheetName: string,
  vehiculoData: any,
  sheetType: 'VENTAS' | 'COMPRAS'
) {
  try {
    const auth = await getGoogleSheetsAuth()
    const sheets = google.sheets({ version: 'v4', auth })

    // Obtener las posiciones de las columnas
    const positions = await getColumnPositions(spreadsheetId, sheetName, sheetType)
    
    // Crear un array con espacios vacíos hasta la columna más alta
    const maxColumn = Math.max(...Object.values(positions).filter(p => p >= 0))
    const rowData = new Array(maxColumn + 1).fill('')
    
    // Formatear datos para envío a Google Sheets
    const marcaCamelCase = vehiculoData.marca.toLowerCase().replace(/\b\w/g, l => l.toUpperCase())
    const modeloCamelCase = vehiculoData.modelo.toLowerCase().replace(/\b\w/g, l => l.toUpperCase())
    const matriculaMayuscula = vehiculoData.matricula.toUpperCase()

    // Formatear referencia según el tipo
    let referenciaFormateada = vehiculoData.referencia
    if (vehiculoData.tipo === 'Coche R') {
      // Si es Coche R, formatear como #R-XX
      const numero = vehiculoData.referencia.replace(/^#?R?/i, '') // Remover #, R si existen
      referenciaFormateada = `#R-${numero.padStart(2, '0')}` // Asegurar 2 dígitos con ceros a la izquierda
    } else if (vehiculoData.tipo === 'Deposito Venta') {
      // Si es Deposito Venta, formatear como #D-XX
      const numero = vehiculoData.referencia.replace(/^#?D?/i, '') // Remover #, D si existen
      referenciaFormateada = `#D-${numero.padStart(2, '0')}` // Asegurar 2 dígitos con ceros a la izquierda
    } else {
      // Para otros tipos, mantener el formato original con #
      referenciaFormateada = vehiculoData.referencia.startsWith('#') 
        ? vehiculoData.referencia 
        : `#${vehiculoData.referencia}`
    }

    // Colocar los datos en las posiciones correctas
    if (positions.REFERENCIA >= 0) rowData[positions.REFERENCIA] = referenciaFormateada
    if (positions.MARCA >= 0) rowData[positions.MARCA] = marcaCamelCase
    if (positions.MODELO >= 0) rowData[positions.MODELO] = modeloCamelCase
    if (positions.MATRICULA >= 0) rowData[positions.MATRICULA] = matriculaMayuscula
    if (positions.BASTIDOR >= 0) rowData[positions.BASTIDOR] = vehiculoData.bastidor
    if (positions.KMS >= 0) rowData[positions.KMS] = vehiculoData.kms


    // Escribir en la hoja
    const result = await sheets.spreadsheets.values.append({
      spreadsheetId,
      range: `${sheetName}!A1`,
      valueInputOption: 'RAW',
      insertDataOption: 'INSERT_ROWS',
      requestBody: {
        values: [rowData],
      },
    })

    // Obtener el número de la fila recién insertada
    const insertedRowNumber = result.data.updates?.updatedRange?.match(/(\d+):/)?.[1]
    
    if (insertedRowNumber) {
      // Aplicar formato blanco a la nueva fila
      await sheets.spreadsheets.batchUpdate({
        spreadsheetId,
        requestBody: {
          requests: [{
            repeatCell: {
              range: {
                sheetId: await getSheetId(spreadsheetId, sheetName),
                startRowIndex: parseInt(insertedRowNumber) - 1,
                endRowIndex: parseInt(insertedRowNumber),
                startColumnIndex: 0,
                endColumnIndex: maxColumn + 1
              },
              cell: {
                userEnteredFormat: {
                  backgroundColor: { red: 1, green: 1, blue: 1 }, // Blanco
                  textFormat: {
                    foregroundColor: { red: 0, green: 0, blue: 0 } // Texto negro
                  }
                }
              },
              fields: 'userEnteredFormat(backgroundColor,textFormat)'
            }
          }]
        }
      })
    }

    console.log(`Datos escritos en ${sheetName}:`, result.data)
    return result.data
  } catch (error) {
    console.error(`Error writing to Google Sheets (${sheetName}):`, error)
    throw error
  }
}

// Función para escribir vehículo en ambas hojas de cálculo según el tipo
export async function writeVehiculoToSheets(vehiculo: any) {
  try {
    const { SPREADSHEET_IDS, SHEET_NAMES } = SHEETS_CONFIG

    // Obtener el nombre de las hojas según el tipo
    const ventasSheetName = SHEET_NAMES.VENTAS[vehiculo.tipo] || SHEET_NAMES.VENTAS['Compra']
    const comprasSheetName = SHEET_NAMES.COMPRAS[vehiculo.tipo] || SHEET_NAMES.COMPRAS['Compra']
    
    // Escribir en ambas hojas de cálculo separadas
    const promises = [
      writeToGoogleSheets(SPREADSHEET_IDS.VENTAS, ventasSheetName, vehiculo, 'VENTAS'),
      writeToGoogleSheets(SPREADSHEET_IDS.COMPRAS, comprasSheetName, vehiculo, 'COMPRAS')
    ]

    await Promise.all(promises)
    console.log(`Vehículo guardado en Google Sheets - Ventas (${ventasSheetName}) y Compras (${comprasSheetName})`)
    
  } catch (error) {
    console.error('Error writing vehicle to Google Sheets:', error)
    throw error
  }
}

// Función para hacer retry con backoff exponencial
async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  maxRetries: number = 3,
  baseDelay: number = 1000
): Promise<T> {
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return await fn()
    } catch (error: any) {
      if (error.code === 429 && attempt < maxRetries - 1) {
        // Quota exceeded, wait with exponential backoff
        const delay = baseDelay * Math.pow(2, attempt)
        console.log(`Quota exceeded, retrying in ${delay}ms (attempt ${attempt + 1}/${maxRetries})`)
        await new Promise(resolve => setTimeout(resolve, delay))
        continue
      }
      throw error
    }
  }
  throw new Error('Max retries exceeded')
}

// Función para obtener datos de Google Sheets (versión optimizada para cuotas)
export async function getGoogleSheetsData() {
  try {
    const auth = await getGoogleSheetsAuth()
    const sheets = google.sheets({ version: 'v4', auth })
    
    const allData = []
    
    // Solo obtener datos de la hoja "Expo" primero (la más importante)
    const primarySheet = 'Expo'
    
    try {
      console.log(`Leyendo hoja principal: ${primarySheet}`)
      const response = await retryWithBackoff(async () => {
        return await sheets.spreadsheets.values.get({
          spreadsheetId: SHEETS_CONFIG.SPREADSHEET_IDS.VENTAS,
          range: `${primarySheet}!A:Z`
        })
      })
      
      const rows = response.data.values
      if (rows && rows.length > 1) {
        const headers = rows[0]
        const dataRows = rows.slice(1)
        
        dataRows.forEach(row => {
          const rowData: any = {}
          headers.forEach((header, index) => {
            rowData[header] = row[index] || ''
          })
          allData.push(rowData)
        })
        console.log(`Datos obtenidos de ${primarySheet}: ${dataRows.length} filas`)
      }
    } catch (error) {
      console.error(`Error reading primary sheet ${primarySheet}:`, error)
      throw error // Si falla la hoja principal, lanzar error
    }
    
    // Intentar leer las otras hojas solo si no hay error de cuota
    const additionalSheets = ['R', 'Deposito']
    
    for (const sheetName of additionalSheets) {
      try {
        console.log(`Intentando leer hoja adicional: ${sheetName}`)
        const response = await retryWithBackoff(async () => {
          return await sheets.spreadsheets.values.get({
            spreadsheetId: SHEETS_CONFIG.SPREADSHEET_IDS.VENTAS,
            range: `${sheetName}!A:Z`
          })
        })
        
        const rows = response.data.values
        if (rows && rows.length > 1) {
          const headers = rows[0]
          const dataRows = rows.slice(1)
          
          dataRows.forEach(row => {
            const rowData: any = {}
            headers.forEach((header, index) => {
              rowData[header] = row[index] || ''
            })
            allData.push(rowData)
          })
          console.log(`Datos obtenidos de ${sheetName}: ${dataRows.length} filas`)
        }
        
        // Delay entre solicitudes para evitar exceder cuota
        await new Promise(resolve => setTimeout(resolve, 3000)) // 3 segundos de delay
        
      } catch (error) {
        console.error(`Error reading additional sheet ${sheetName}:`, error)
        // Si es error de cuota, parar aquí y devolver lo que tenemos
        if (error.code === 429) {
          console.log('Cuota excedida, devolviendo datos parciales')
          break
        }
      }
    }
    
    return allData
    
  } catch (error) {
    console.error('Error getting Google Sheets data:', error)
    throw error
  }
}

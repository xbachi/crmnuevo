// Configuración de sincronización
export const SYNC_CONFIG = {
  // Deshabilitar sincronización con Google Sheets temporalmente
  GOOGLE_SHEETS_ENABLED: false,
  
  // Razón de la deshabilitación
  DISABLE_REASON: 'Límites de cuota de Google Sheets API excedidos',
  
  // Mensaje para mostrar al usuario
  USER_MESSAGE: 'La sincronización con Google Sheets está deshabilitada temporalmente debido a límites de cuota. Los datos mostrados son solo locales.',
  
  // Cuándo se puede rehabilitar (opcional)
  ENABLE_AFTER: '2024-01-01', // Fecha estimada para rehabilitar
}

// Función para verificar si la sincronización está habilitada
export function isSyncEnabled(): boolean {
  return SYNC_CONFIG.GOOGLE_SHEETS_ENABLED
}

// Función para obtener el mensaje de estado
export function getSyncStatusMessage(): string {
  return SYNC_CONFIG.USER_MESSAGE
}

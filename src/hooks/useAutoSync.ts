import { useEffect, useCallback } from 'react'

export function useAutoSync(onSync: () => Promise<void>) {
  const syncData = useCallback(async () => {
    try {
      await onSync()
      console.log('Sincronización automática completada')
    } catch (error) {
      console.error('Error en sincronización automática:', error)
    }
  }, [onSync])

  useEffect(() => {
    // TEMPORALMENTE DESHABILITADO - Problema de cuota de Google Sheets
    // TODO: Rehabilitar cuando se resuelva el problema de cuota
    
    console.log('Sincronización automática deshabilitada temporalmente debido a límites de cuota de Google Sheets')
    
    // Configurar sincronización cada 12 horas (43200000 ms) - DESHABILITADO
    // const interval = setInterval(syncData, 12 * 60 * 60 * 1000)

    // Limpiar el intervalo al desmontar
    // return () => clearInterval(interval)
  }, [syncData])

  return { syncData }
}

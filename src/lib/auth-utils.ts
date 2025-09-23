/**
 * Utilidades para verificar autenticación de usuarios CRM
 */

export function isCrmUserAuthenticated(): boolean {
  if (typeof window === 'undefined') {
    return false
  }

  // Verificar localStorage - el CRM guarda el usuario con la clave 'user'
  const crmUser = localStorage.getItem('user')

  if (crmUser) {
    try {
      const user = JSON.parse(crmUser)
      // Verificar que tenga los campos necesarios
      if (user && user.id && user.username && user.role) {
        return true
      }
    } catch (e) {
      console.error('Error parsing CRM user data:', e)
      // Limpiar datos corruptos
      localStorage.removeItem('user')
    }
  }

  return false
}

export function getCrmUserInfo(): { user: any | null } {
  if (typeof window === 'undefined') {
    return { user: null }
  }

  const userStr = localStorage.getItem('user')

  let user = null
  if (userStr) {
    try {
      user = JSON.parse(userStr)
    } catch (e) {
      console.error('Error parsing CRM user data:', e)
      localStorage.removeItem('user')
    }
  }

  return { user }
}

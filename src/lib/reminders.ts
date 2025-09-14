// Sistema de recordatorios para el CRM
export interface Reminder {
  id: string
  type: 'documentacion_cambio_nombre' | 'itv_vencida' | 'seguro_vencido' | 'revision_programada'
  title: string
  description: string
  dealId?: number
  vehiculoId?: number
  clienteId?: number
  priority: 'high' | 'medium' | 'low'
  createdAt: Date
  dueDate?: Date
  completed: boolean
  completedAt?: Date
}

// Crear recordatorio para documentación de cambio de nombre
export function createDocumentacionReminder(dealId: number, clienteNombre: string, vehiculoReferencia: string): Reminder {
  return {
    id: `doc-cambio-nombre-${dealId}-${Date.now()}`,
    type: 'documentacion_cambio_nombre',
    title: 'Documentación para cambio de nombre',
    description: `Enviar documentación para cambio de nombre del vehículo ${vehiculoReferencia} al cliente ${clienteNombre}`,
    dealId,
    priority: 'high',
    createdAt: new Date(),
    dueDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 días desde ahora
    completed: false
  }
}

// Obtener recordatorios desde localStorage
export function getReminders(): Reminder[] {
  if (typeof window === 'undefined') return []
  
  try {
    const stored = localStorage.getItem('crm-reminders')
    if (!stored) return []
    
    const reminders = JSON.parse(stored)
    return reminders.map((r: any) => ({
      ...r,
      createdAt: new Date(r.createdAt),
      dueDate: r.dueDate ? new Date(r.dueDate) : undefined,
      completedAt: r.completedAt ? new Date(r.completedAt) : undefined
    }))
  } catch (error) {
    console.error('Error loading reminders:', error)
    return []
  }
}

// Guardar recordatorios en localStorage
export function saveReminders(reminders: Reminder[]): void {
  if (typeof window === 'undefined') return
  
  try {
    localStorage.setItem('crm-reminders', JSON.stringify(reminders))
  } catch (error) {
    console.error('Error saving reminders:', error)
  }
}

// Agregar un nuevo recordatorio
export function addReminder(reminder: Reminder): void {
  const reminders = getReminders()
  reminders.push(reminder)
  saveReminders(reminders)
}

// Marcar recordatorio como completado
export function completeReminder(reminderId: string): void {
  const reminders = getReminders()
  const updated = reminders.map(reminder => 
    reminder.id === reminderId 
      ? { ...reminder, completed: true, completedAt: new Date() }
      : reminder
  )
  saveReminders(updated)
}

// Eliminar recordatorio
export function deleteReminder(reminderId: string): void {
  const reminders = getReminders()
  const filtered = reminders.filter(reminder => reminder.id !== reminderId)
  saveReminders(filtered)
}

// Obtener recordatorios pendientes
export function getPendingReminders(): Reminder[] {
  return getReminders().filter(reminder => !reminder.completed)
}

// Obtener recordatorios por prioridad
export function getRemindersByPriority(priority: 'high' | 'medium' | 'low'): Reminder[] {
  return getPendingReminders().filter(reminder => reminder.priority === priority)
}

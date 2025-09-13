'use client'

import { useState, useEffect } from 'react'
import {
  DndContext,
  DragEndEvent,
  DragOverEvent,
  DragStartEvent,
  PointerSensor,
  useSensor,
  useSensors,
  DragOverlay,
} from '@dnd-kit/core'
import { arrayMove } from '@dnd-kit/sortable'
import KanbanColumn from './KanbanColumn'
import { useToast } from './Toast'
import { useConfirmModal } from './ConfirmModal'

interface Vehiculo {
  id: number
  referencia: string
  marca: string
  modelo: string
  matricula: string
  bastidor: string
  kms: number
  tipo: string
  estado: string
  orden: number
  createdAt: string
  // Campos adicionales de Google Sheets
  fechaMatriculacion?: string
  año?: number
  itv?: string
  seguro?: string
  segundaLlave?: boolean
  documentacion?: string
}

interface KanbanBoardProps {
  vehiculos: Vehiculo[]
  onUpdateVehiculos: (vehiculos: Vehiculo[]) => void
}

const ESTADOS = [
  {
    id: 'SIN_ESTADO',
    title: 'Sin Estado',
    color: 'bg-slate-500'
  },
  {
    id: 'REVI_INIC',
    title: 'Revisión Inicial',
    color: 'bg-slate-600'
  },
  {
    id: 'MECAUTO',
    title: 'Mecánica/Automática',
    color: 'bg-blue-600'
  },
  {
    id: 'REVI_PINTURA',
    title: 'Revisión Pintura',
    color: 'bg-purple-600'
  },
  {
    id: 'PINTURA',
    title: 'Pintura',
    color: 'bg-indigo-600'
  },
  {
    id: 'LIMPIEZA',
    title: 'Limpieza',
    color: 'bg-cyan-600'
  },
  {
    id: 'FOTOS',
    title: 'Fotos',
    color: 'bg-teal-600'
  },
  {
    id: 'PUBLICADO',
    title: 'Publicado',
    color: 'bg-green-600'
  }
]

export default function KanbanBoard({ vehiculos, onUpdateVehiculos }: KanbanBoardProps) {
  const [activeId, setActiveId] = useState<number | null>(null)
  const { showToast, ToastContainer } = useToast()
  const { showConfirm, ConfirmModalComponent } = useConfirmModal()

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    })
  )

  // Agrupar vehículos por estado
  const vehiculosPorEstado = ESTADOS.reduce((acc, estado) => {
    if (estado.id === 'SIN_ESTADO') {
      // Para "Sin Estado", incluir vehículos que no tienen estado definido, vacío, o estados inválidos
      const estadosValidos = ESTADOS.map(e => e.id).filter(id => id !== 'SIN_ESTADO')
      acc[estado.id] = vehiculos
        .filter(v => !v.estado || v.estado === '' || v.estado === 'SIN_ESTADO' || !estadosValidos.includes(v.estado))
        .sort((a, b) => a.orden - b.orden)
    } else {
      acc[estado.id] = vehiculos
        .filter(v => v.estado === estado.id)
        .sort((a, b) => a.orden - b.orden)
    }
    return acc
  }, {} as Record<string, Vehiculo[]>)

  const handleDragStart = (event: DragStartEvent) => {
    setActiveId(event.active.id as number)
  }

  const handleDragOver = (event: DragOverEvent) => {
    // Esta función se puede usar para efectos visuales durante el drag
  }

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event
    setActiveId(null)

    if (!over) return

    const activeId = active.id as number
    const overId = over.id as number

    // Encontrar el vehículo activo
    const activeVehiculo = vehiculos.find(v => v.id === activeId)
    if (!activeVehiculo) return

    // Si se está moviendo dentro de la misma columna
    if (activeVehiculo.estado === overId) {
      const vehiculosEnEstado = vehiculosPorEstado[activeVehiculo.estado]
      const oldIndex = vehiculosEnEstado.findIndex(v => v.id === activeId)
      const newIndex = vehiculosEnEstado.findIndex(v => v.id === overId)

      if (oldIndex !== newIndex) {
        const newVehiculos = arrayMove(vehiculosEnEstado, oldIndex, newIndex)
        
        // Actualizar órdenes
        const updates = newVehiculos.map((v, index) => ({
          id: v.id,
          estado: v.estado,
          orden: index
        }))

        try {
          const response = await fetch('/api/vehiculos/kanban', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ updates })
          })

          if (response.ok) {
            const updatedVehiculos = await response.json()
            onUpdateVehiculos(updatedVehiculos)
            showToast('Orden actualizado', 'success')
          } else {
            showToast('Error al actualizar el orden', 'error')
          }
        } catch (error) {
          showToast('Error al actualizar el orden', 'error')
        }
      }
    } else {
      // Si se está moviendo a otra columna
      const newEstado = overId as string
      const vehiculosEnNuevoEstado = vehiculosPorEstado[newEstado] || []
      const newOrden = vehiculosEnNuevoEstado.length

      try {
        const response = await fetch('/api/vehiculos/kanban', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            updates: [{
              id: activeId,
              estado: newEstado === 'SIN_ESTADO' ? '' : newEstado,
              orden: newOrden
            }]
          })
        })

        if (response.ok) {
          const updatedVehiculos = await response.json()
          onUpdateVehiculos(updatedVehiculos)
          showToast(`Vehículo movido a ${ESTADOS.find(e => e.id === newEstado)?.title}`, 'success')
        } else {
          showToast('Error al mover el vehículo', 'error')
        }
      } catch (error) {
        showToast('Error al mover el vehículo', 'error')
      }
    }
  }

  const activeVehiculo = activeId ? vehiculos.find(v => v.id === activeId) : null

  return (
    <div className="h-full w-full">
      <DndContext
        sensors={sensors}
        onDragStart={handleDragStart}
        onDragOver={handleDragOver}
        onDragEnd={handleDragEnd}
      >
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-7 gap-3 h-full overflow-y-auto">
          {ESTADOS.map((estado) => (
            <KanbanColumn
              key={estado.id}
              id={estado.id}
              title={estado.title}
              vehiculos={vehiculosPorEstado[estado.id] || []}
              color={estado.color}
            />
          ))}
        </div>

        <DragOverlay>
          {activeVehiculo ? (
            <div className="bg-white rounded-lg border border-slate-200 shadow-lg p-4 opacity-90">
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-lg font-bold text-slate-800">#{activeVehiculo.referencia}</h3>
                <span className="px-2 py-1 text-xs font-medium rounded-full bg-green-100 text-green-800 border border-green-200">
                  {activeVehiculo.tipo}
                </span>
              </div>
              <div className="text-sm text-slate-600">
                {activeVehiculo.marca} {activeVehiculo.modelo}
              </div>
            </div>
          ) : null}
        </DragOverlay>
      </DndContext>

      <ToastContainer />
      <ConfirmModalComponent />
    </div>
  )
}

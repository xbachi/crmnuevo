'use client'

import { useState, useEffect } from 'react'
import {
  DndContext,
  DragEndEvent,
  DragOverEvent,
  DragStartEvent,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
  DragOverlay,
  useDroppable,
} from '@dnd-kit/core'
import {
  arrayMove,
  SortableContext,
  verticalListSortingStrategy,
  horizontalListSortingStrategy,
} from '@dnd-kit/sortable'
import KanbanColumn from './KanbanColumn'
import DraggableVehicleCard from './DraggableVehicleCard'
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
  onUpdateVehiculos: (
    vehiculos: Vehiculo[] | ((prev: Vehiculo[]) => Vehiculo[])
  ) => void
}

const ESTADOS = [
  {
    id: 'SIN_ESTADO',
    title: 'Inicial',
    color: 'bg-slate-500',
  },
  {
    id: 'REVI_INIC',
    title: 'Revisión Inicial',
    color: 'bg-slate-600',
  },
  {
    id: 'MECAUTO',
    title: 'Mecauto',
    color: 'bg-blue-600',
  },
  {
    id: 'REVI_PINTURA',
    title: 'Revisión Pintura',
    color: 'bg-purple-600',
  },
  {
    id: 'PINTURA',
    title: 'Pintura',
    color: 'bg-indigo-600',
  },
  {
    id: 'LIMPIEZA',
    title: 'Limpieza',
    color: 'bg-cyan-600',
  },
  {
    id: 'FOTOS',
    title: 'Fotos',
    color: 'bg-teal-600',
  },
  {
    id: 'PUBLICADO',
    title: 'Publicado',
    color: 'bg-green-600',
  },
]

export default function KanbanBoard({
  vehiculos,
  onUpdateVehiculos,
}: KanbanBoardProps) {
  const [activeId, setActiveId] = useState<number | null>(null)
  const { showToast, ToastContainer } = useToast()
  const { showConfirm, ConfirmModalComponent } = useConfirmModal()

  // Hook para la zona de drop de PUBLICADO
  const { setNodeRef: setPublicadoNodeRef, isOver: isPublicadoOver } =
    useDroppable({ id: 'PUBLICADO' })

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 3,
      },
    }),
    useSensor(TouchSensor, {
      activationConstraint: {
        delay: 200,
        tolerance: 5,
      },
    })
  )

  // Agrupar vehículos por estado
  const vehiculosPorEstado = ESTADOS.reduce(
    (acc, estado) => {
      if (estado.id === 'SIN_ESTADO') {
        // Para "Inicial", incluir vehículos que no tienen estado definido, vacío, o estados inválidos
        const estadosValidos = ESTADOS.map((e) => e.id).filter(
          (id) => id !== 'SIN_ESTADO'
        )
        acc[estado.id] = vehiculos
          .filter(
            (v) =>
              !v.estado ||
              v.estado === '' ||
              v.estado === 'SIN_ESTADO' ||
              !estadosValidos.includes(v.estado)
          )
          .sort((a, b) => a.orden - b.orden)
      } else {
        acc[estado.id] = vehiculos
          .filter((v) => v.estado === estado.id)
          .sort((a, b) => a.orden - b.orden)
      }
      return acc
    },
    {} as Record<string, Vehiculo[]>
  )

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
    const overId = over.id

    // Encontrar el vehículo activo
    const activeVehiculo = vehiculos.find((v) => v.id === activeId)
    if (!activeVehiculo) return

    // Determinar si se está moviendo a una columna o a otro vehículo
    const isMovingToColumn =
      typeof overId === 'string' &&
      ESTADOS.some((estado) => estado.id === overId)
    const isMovingToVehicle = typeof overId === 'number'

    if (isMovingToColumn) {
      // Moviendo a una columna (cambio de estado)
      const newEstado = overId as string
      const vehiculosEnNuevoEstado = vehiculosPorEstado[newEstado] || []
      const newOrden = vehiculosEnNuevoEstado.length

      try {
        const response = await fetch('/api/vehiculos/kanban', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            updates: [
              {
                id: activeId,
                estado: newEstado === 'SIN_ESTADO' ? '' : newEstado,
                orden: newOrden,
              },
            ],
          }),
        })

        if (response.ok) {
          const updatedVehiculos = await response.json()

          // Actualizar solo el vehículo que cambió
          onUpdateVehiculos((prevVehiculos) => {
            const updatedMap = new Map(updatedVehiculos.map((v) => [v.id, v]))
            return prevVehiculos.map((v) => updatedMap.get(v.id) || v)
          })
          showToast(
            `Vehículo movido a ${ESTADOS.find((e) => e.id === newEstado)?.title}`,
            'success'
          )
        } else {
          showToast('Error al mover el vehículo', 'error')
        }
      } catch (error) {
        showToast('Error al mover el vehículo', 'error')
      }
    } else if (isMovingToVehicle) {
      // Moviendo a otro vehículo (cambio de orden)
      const overVehiculo = vehiculos.find((v) => v.id === overId)
      if (!overVehiculo) return

      // Si se está moviendo dentro de la misma columna
      if (activeVehiculo.estado === overVehiculo.estado) {
        // Determinar el estado correcto para la columna
        const estadoColumna =
          activeVehiculo.estado ||
          (activeVehiculo.estado === '' ? '' : 'SIN_ESTADO')
        const vehiculosEnEstado =
          vehiculosPorEstado[estadoColumna] || vehiculosPorEstado['SIN_ESTADO']
        const oldIndex = vehiculosEnEstado.findIndex((v) => v.id === activeId)
        const newIndex = vehiculosEnEstado.findIndex((v) => v.id === overId)

        if (oldIndex !== newIndex) {
          const newVehiculos = arrayMove(vehiculosEnEstado, oldIndex, newIndex)

          // Actualizar órdenes
          const updates = newVehiculos.map((v, index) => ({
            id: v.id,
            estado: v.estado || '',
            orden: index,
          }))

          try {
            const response = await fetch('/api/vehiculos/kanban', {
              method: 'PUT',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ updates }),
            })

            if (response.ok) {
              const updatedVehiculos = await response.json()
              // Actualizar solo los vehículos que cambiaron
              onUpdateVehiculos((prevVehiculos) => {
                const updatedMap = new Map(
                  updatedVehiculos.map((v) => [v.id, v])
                )
                return prevVehiculos.map((v) => updatedMap.get(v.id) || v)
              })
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
        const newEstado = overVehiculo.estado || ''
        const estadoColumna = newEstado === '' ? 'SIN_ESTADO' : newEstado
        const vehiculosEnNuevoEstado = vehiculosPorEstado[estadoColumna] || []
        const newOrden = vehiculosEnNuevoEstado.length

        try {
          const response = await fetch('/api/vehiculos/kanban', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              updates: [
                {
                  id: activeId,
                  estado: newEstado,
                  orden: newOrden,
                },
              ],
            }),
          })

          if (response.ok) {
            const updatedVehiculos = await response.json()
            // Actualizar solo el vehículo que cambió
            onUpdateVehiculos((prevVehiculos) => {
              const updatedMap = new Map(updatedVehiculos.map((v) => [v.id, v]))
              return prevVehiculos.map((v) => updatedMap.get(v.id) || v)
            })
            showToast(
              `Vehículo movido a ${ESTADOS.find((e) => e.id === newEstado)?.title}`,
              'success'
            )
          } else {
            showToast('Error al mover el vehículo', 'error')
          }
        } catch (error) {
          showToast('Error al mover el vehículo', 'error')
        }
      }
    }
  }

  const activeVehiculo = activeId
    ? vehiculos.find((v) => v.id === activeId)
    : null

  return (
    <div className="h-full w-full">
      <DndContext
        sensors={sensors}
        onDragStart={handleDragStart}
        onDragOver={handleDragOver}
        onDragEnd={handleDragEnd}
      >
        <div className="flex flex-col gap-4 h-full">
          {/* Columnas principales arriba */}
          <div className="grid grid-cols-7 gap-3 flex-1">
            {ESTADOS.filter((estado) => estado.id !== 'PUBLICADO').map(
              (estado) => (
                <KanbanColumn
                  key={estado.id}
                  id={estado.id}
                  title={estado.title}
                  vehiculos={vehiculosPorEstado[estado.id] || []}
                  color={estado.color}
                />
              )
            )}
          </div>

          {/* Columna Publicado abajo y más ancha con distribución horizontal */}
          <div className="w-full flex justify-center mt-12">
            <div className="flex flex-col h-full w-4/5">
              {/* Header de la columna Publicado */}
              <div className="bg-green-600 px-3 py-2 rounded-t-md flex items-center justify-center flex-shrink-0">
                <h3 className="text-sm font-semibold text-white">Publicado</h3>
                <div className="text-xs text-white/80 bg-white/20 px-2 py-1 rounded-full flex-shrink-0 ml-2">
                  {(vehiculosPorEstado['PUBLICADO'] || []).length}
                </div>
              </div>

              {/* Área de drop con distribución horizontal */}
              <div
                ref={setPublicadoNodeRef}
                className={`flex-1 p-2 rounded-b-md min-h-[200px] max-h-[400px] overflow-y-auto transition-colors ${
                  isPublicadoOver
                    ? 'bg-green-100 border-2 border-green-400 border-dashed'
                    : 'bg-slate-100'
                }`}
              >
                <SortableContext
                  items={(vehiculosPorEstado['PUBLICADO'] || []).map(
                    (v) => v.id
                  )}
                  strategy={horizontalListSortingStrategy}
                >
                  {(vehiculosPorEstado['PUBLICADO'] || []).length === 0 ? (
                    <div className="text-center py-6 text-slate-500">
                      <div className="text-2xl mb-1">📋</div>
                      <p className="text-xs">Sin vehículos</p>
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                      {(vehiculosPorEstado['PUBLICADO'] || []).map(
                        (vehiculo) => (
                          <DraggableVehicleCard
                            key={vehiculo.id}
                            vehiculo={vehiculo}
                          />
                        )
                      )}
                    </div>
                  )}
                </SortableContext>
              </div>
            </div>
          </div>
        </div>

        <DragOverlay>
          {activeVehiculo ? (
            <div className="bg-white rounded-lg border border-slate-200 shadow-lg p-4 opacity-90">
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-lg font-bold text-slate-800">
                  #{activeVehiculo.referencia}
                </h3>
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

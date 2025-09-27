'use client'

import { useDroppable } from '@dnd-kit/core'
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable'
import DraggableVehicleCard from './DraggableVehicleCard'

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

interface KanbanColumnProps {
  id: string
  title: string
  vehiculos: Vehiculo[]
  color: string
}

export default function KanbanColumn({
  id,
  title,
  vehiculos,
  color,
}: KanbanColumnProps) {
  const { setNodeRef, isOver } = useDroppable({ id })

  return (
    <div className="flex flex-col h-full w-full">
      {/* Header de la columna - Estilo Trello */}
      <div
        className={`${color} px-2 xl:px-3 py-1.5 xl:py-2 rounded-t-md flex items-center justify-between flex-shrink-0`}
      >
        <h3 className="text-xs xl:text-sm font-semibold text-white truncate">
          {title}
        </h3>
        <div className="text-xs text-white/80 bg-white/20 px-1.5 xl:px-2 py-0.5 xl:py-1 rounded-full flex-shrink-0 ml-1 xl:ml-2">
          {vehiculos.length}
        </div>
      </div>

      {/* Área de drop */}
      <div
        ref={setNodeRef}
        className={`flex-1 p-1 xl:p-2 rounded-b-md min-h-[200px] xl:min-h-[300px] max-h-[400px] xl:max-h-[600px] overflow-y-auto transition-colors ${
          isOver
            ? 'bg-blue-100 border-2 border-blue-400 border-dashed'
            : 'bg-slate-100'
        }`}
      >
        <SortableContext
          items={vehiculos.map((v) => v.id)}
          strategy={verticalListSortingStrategy}
        >
          <div className="space-y-2">
            {vehiculos.length === 0 ? (
              <div className="text-center py-6 text-slate-500">
                <div className="text-2xl mb-1">📋</div>
                <p className="text-xs">Sin vehículos</p>
              </div>
            ) : (
              vehiculos.map((vehiculo) => (
                <DraggableVehicleCard key={vehiculo.id} vehiculo={vehiculo} />
              ))
            )}
          </div>
        </SortableContext>
      </div>
    </div>
  )
}

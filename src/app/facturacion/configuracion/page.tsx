'use client'

export default function ConfiguracionPagePlaceholder() {
  return (
    <div className="bg-white border border-gray-200 rounded-lg p-8">
      <h2 className="text-lg font-semibold text-gray-900 mb-2">
        Configuración de facturación
      </h2>
      <p className="text-sm text-gray-600 mb-4">
        Esta sección estará disponible en la próxima entrega (Phase 4). Permitirá
        editar:
      </p>
      <ul className="text-sm text-gray-700 list-disc list-inside space-y-1">
        <li>Datos del vendedor (nombre legal, CIF, dirección)</li>
        <li>Texto legal del régimen REBU</li>
        <li>Tipo de IVA estándar</li>
        <li>Formato de numeración por defecto</li>
      </ul>
      <p className="text-xs text-gray-500 mt-4">
        Por ahora estos valores viven en{' '}
        <code className="bg-gray-100 px-1 rounded">src/config/invoiceConfig.ts</code>
        . Cambios requieren un deploy.
      </p>
    </div>
  )
}

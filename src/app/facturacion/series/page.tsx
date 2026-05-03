'use client'

export default function SeriesPagePlaceholder() {
  return (
    <div className="bg-white border border-gray-200 rounded-lg p-8 text-center">
      <h2 className="text-lg font-semibold text-gray-900 mb-2">
        Series y numeración
      </h2>
      <p className="text-sm text-gray-600">
        Esta página estará disponible en la próxima entrega (Phase 4). Por ahora,
        las series activas son:
      </p>
      <ul className="mt-4 text-sm text-gray-700 inline-block text-left">
        <li>
          <strong>REBU</strong> — serie <code>R-2026</code>, próxima:{' '}
          <code>R-2026-023</code>
        </li>
        <li>
          <strong>IVA</strong> — serie <code>F-2026</code>, próxima:{' '}
          <code>F-2026-4222</code>
        </li>
      </ul>
    </div>
  )
}

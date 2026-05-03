import { NextResponse } from 'next/server'

/**
 * Maps a thrown error from a delete operation to a user-friendly HTTP response.
 * Postgres FK violations become 409 Conflict with a hint about which related
 * records are blocking the deletion. All other errors are 500.
 *
 * Pass the user-facing entity name (e.g. "vehículo", "cliente") and the route
 * is responsible for first checking that the row existed (returning 404 itself).
 */
export function handleDeleteError(
  error: unknown,
  entityLabel: string
): NextResponse {
  const err = error as {
    code?: string
    message?: string
    detail?: string
    constraint?: string
    table?: string
  }

  if (err?.code === '23503') {
    return NextResponse.json(
      {
        error: `No se puede eliminar este ${entityLabel} porque tiene registros relacionados que lo están utilizando.`,
        detail: err.detail ?? null,
        constraint: err.constraint ?? null,
        relatedTable: err.table ?? null,
        code: 'FK_VIOLATION',
      },
      { status: 409 }
    )
  }

  console.error(`[handleDeleteError] ${entityLabel}:`, error)
  return NextResponse.json(
    { error: 'Error interno del servidor' },
    { status: 500 }
  )
}

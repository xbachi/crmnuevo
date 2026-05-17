import { NextRequest, NextResponse } from 'next/server'
import {
  listClientesB2B,
  createClienteB2B,
  type ClienteB2BTipo,
} from '@/lib/b2b-database'

export async function GET() {
  try {
    const rows = await listClientesB2B()
    return NextResponse.json(rows)
  } catch (err) {
    console.error('[GET /api/clientes-b2b]', err)
    return NextResponse.json(
      { error: 'Error al listar clientes B2B' },
      { status: 500 }
    )
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const tipo = body.tipo as ClienteB2BTipo
    const razon_social = (body.razon_social ?? '').toString().trim()
    const cif_nif = (body.cif_nif ?? '').toString().trim()

    if (!['empresa', 'autonomo', 'profesional'].includes(tipo)) {
      return NextResponse.json(
        { error: 'tipo inválido (empresa | autonomo | profesional)' },
        { status: 400 }
      )
    }
    if (!razon_social) {
      return NextResponse.json(
        { error: 'razón social / nombre completo obligatorio' },
        { status: 400 }
      )
    }
    if (!cif_nif) {
      return NextResponse.json(
        { error: 'CIF / NIF / DNI obligatorio' },
        { status: 400 }
      )
    }

    const created = await createClienteB2B({
      tipo,
      razon_social,
      cif_nif,
      contacto_nombre: body.contacto_nombre || null,
      telefono: body.telefono || null,
      email: body.email || null,
      direccion: body.direccion || null,
      ciudad: body.ciudad || null,
      codigo_postal: body.codigo_postal || null,
      provincia: body.provincia || null,
      notas: body.notas || null,
    })
    return NextResponse.json(created, { status: 201 })
  } catch (err) {
    console.error('[POST /api/clientes-b2b]', err)
    return NextResponse.json(
      { error: 'Error al crear cliente B2B' },
      { status: 500 }
    )
  }
}

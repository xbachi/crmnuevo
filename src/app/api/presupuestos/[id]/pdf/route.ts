/**
 * POST /api/presupuestos/[id]/pdf — genera el PDF, lo sube a Blob y guarda pdf_url.
 * GET  /api/presupuestos/[id]/pdf — descarga (proxy autenticado del Blob).
 */
import { NextRequest, NextResponse } from 'next/server'
import { requireApiSession } from '@/lib/apiAuth'
import { leerPresupuesto } from '@/lib/presupuesto/repo'
import {
  generarYSubirPdf,
  nombreArchivoDe,
  cargarVehiculoPresupuesto,
} from '@/lib/presupuesto/servicio'
import { BlobNoConfiguradoError } from '@/lib/presupuesto/storage'
import { leerFicha } from '@/lib/fichaComercial'

function parseId(raw: string): number | null {
  const id = parseInt(raw, 10)
  return Number.isInteger(id) && id > 0 ? id : null
}

type Ctx = { params: Promise<{ id: string }> }

export async function POST(request: NextRequest, { params }: Ctx) {
  const auth = requireApiSession(request)
  if (auth.response) return auth.response
  const id = parseId((await params).id)
  if (!id) return NextResponse.json({ error: 'ID inválido' }, { status: 400 })

  try {
    const p = await leerPresupuesto(id)
    if (!p) {
      return NextResponse.json(
        { error: 'Presupuesto no encontrado' },
        { status: 404 }
      )
    }
    const pdf = await generarYSubirPdf(p)
    return NextResponse.json({
      pdf_url: pdf.pdf_url,
      nombreArchivo: pdf.nombreArchivo,
    })
  } catch (e) {
    if (e instanceof BlobNoConfiguradoError) {
      return NextResponse.json({ error: e.message }, { status: 503 })
    }
    console.error('[presupuestos pdf POST]', e)
    return NextResponse.json(
      { error: 'Error interno del servidor' },
      { status: 500 }
    )
  }
}

export async function GET(request: NextRequest, { params }: Ctx) {
  const auth = requireApiSession(request)
  if (auth.response) return auth.response
  const id = parseId((await params).id)
  if (!id) return NextResponse.json({ error: 'ID inválido' }, { status: 400 })

  try {
    const p = await leerPresupuesto(id)
    if (!p) {
      return NextResponse.json(
        { error: 'Presupuesto no encontrado' },
        { status: 404 }
      )
    }
    if (!p.pdf_url) {
      return NextResponse.json({ error: 'PDF no generado' }, { status: 404 })
    }
    const [res, v, f] = await Promise.all([
      fetch(p.pdf_url),
      cargarVehiculoPresupuesto(p.vehiculo_id),
      leerFicha(p.vehiculo_id),
    ])
    if (!res.ok) {
      return NextResponse.json(
        { error: 'No se pudo recuperar el PDF del almacenamiento' },
        { status: 502 }
      )
    }
    const nombre = nombreArchivoDe(
      p,
      v ?? { marca: '', modelo: '', matricula: '' },
      f
    )
    return new NextResponse(await res.arrayBuffer(), {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${nombre}"`,
        'Cache-Control': 'no-store',
      },
    })
  } catch (e) {
    console.error('[presupuestos pdf GET]', e)
    return NextResponse.json(
      { error: 'Error interno del servidor' },
      { status: 500 }
    )
  }
}

import { NextRequest, NextResponse } from 'next/server'
import { getClientesPage, pool } from '@/lib/direct-database'
import { construirPagination, leerPaginacion } from '@/lib/listPagination'

export async function GET(request: NextRequest) {
  try {
    console.log('🔍 [API CLIENTES] Obteniendo lista de clientes...')

    // Con ?page= (limit/q opcionales) se pagina en SQL y la respuesta es
    // { clientes, pagination }. Sin page, el array completo de siempre
    // (selects, notificaciones y fichas lo esperan así).
    const paginacion = leerPaginacion(new URL(request.url).searchParams)
    if (paginacion) {
      const { page, limit, offset, q } = paginacion
      const { rows, total } = await getClientesPage({ limit, offset, q })
      return NextResponse.json(
        { clientes: rows, pagination: construirPagination(total, page, limit) },
        { headers: { 'Cache-Control': 'private, max-age=30' } }
      )
    }

    const client = await pool.connect()
    try {
      const result = await client.query(
        `SELECT * FROM "Cliente" ORDER BY "createdAt" DESC`
      )

      return NextResponse.json(result.rows, {
        // private = solo browser cachea, no CDN.
        // max-age=30s = el browser reusa por 30s entre navegaciones, evita
        // refetchs de la lista completa al volver atrás. POST/PUT no se
        // cachean (no-store implícito en mutaciones).
        headers: { 'Cache-Control': 'private, max-age=30' },
      })
    } finally {
      client.release()
    }
  } catch (error) {
    console.error('❌ [API CLIENTES] Error al obtener clientes:', error)
    return NextResponse.json(
      { error: 'Error al cargar clientes' },
      { status: 500 }
    )
  }
}

const RE_EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

/** Formato de los datos de contacto cuando vienen informados; null si todo vale. */
function validarFormatoContacto(data: {
  email?: string | null
  telefono?: string | null
  dni?: string | null
}): string | null {
  const email = data.email?.trim()
  if (email && !RE_EMAIL.test(email)) {
    return 'El email no tiene un formato válido'
  }
  const digitos = (data.telefono ?? '').replace(/\D/g, '')
  if (digitos.length < 9) {
    return 'El teléfono debe tener al menos 9 dígitos'
  }
  const dni = (data.dni ?? '').replace(/[\s-]/g, '')
  if (dni && !/^[A-Za-z0-9]{7,12}$/.test(dni)) {
    return 'El DNI/NIE/pasaporte debe tener entre 7 y 12 caracteres alfanuméricos'
  }
  return null
}

export async function POST(request: NextRequest) {
  try {
    console.log('🔍 [API CLIENTES] Iniciando creación de cliente...')

    const data = await request.json()
    console.log('🔍 [API CLIENTES] Datos recibidos:', {
      nombre: data.nombre,
      apellidos: data.apellidos,
      telefono: data.telefono,
      email: data.email,
      dni: data.dni,
      direccion: data.direccion,
      ciudad: data.ciudad,
      provincia: data.provincia,
      codPostal: data.codPostal,
    })

    // Validaciones básicas
    if (!data.nombre || data.nombre.trim() === '') {
      console.log('❌ [API CLIENTES] Error: Nombre faltante')
      return NextResponse.json(
        { error: 'El nombre es obligatorio' },
        { status: 400 }
      )
    }

    if (!data.apellidos || data.apellidos.trim() === '') {
      console.log('❌ [API CLIENTES] Error: Apellidos faltantes')
      return NextResponse.json(
        { error: 'Los apellidos son obligatorios' },
        { status: 400 }
      )
    }

    if (!data.telefono || data.telefono.trim() === '') {
      console.log('❌ [API CLIENTES] Error: Teléfono faltante')
      return NextResponse.json(
        { error: 'El teléfono es obligatorio' },
        { status: 400 }
      )
    }
    const formato = validarFormatoContacto(data)
    if (formato) {
      return NextResponse.json({ error: formato }, { status: 400 })
    }

    // Crear cliente con todos los campos
    const client = await pool.connect()
    try {
      console.log('🔍 [API CLIENTES] Conectando a la base de datos...')

      const result = await client.query(
        `
        INSERT INTO "Cliente" (
          nombre, apellidos, telefono, email, dni, direccion, ciudad, provincia, 
          "codigoPostal", estado, prioridad, activo, "comoLlego", "fechaPrimerContacto",
          "proximoPaso", "notasAdicionales", "vehiculosInteres", "presupuestoMaximo", 
          "kilometrajeMaximo", "añoMinimo", "combustiblePreferido", 
          "cambioPreferido", "formaPagoPreferida", "coloresDeseados", etiquetas,
          "necesidadesEspeciales", "createdAt", "updatedAt"
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26, NOW(), NOW()
        ) RETURNING *
      `,
        [
          data.nombre.trim(),
          data.apellidos.trim(),
          data.telefono.trim(),
          data.email?.trim() || null,
          data.dni?.trim() || null,
          data.direccion?.trim() || null,
          data.ciudad?.trim() || null,
          data.provincia?.trim() || null,
          data.codPostal?.trim() || null,
          data.estado || 'nuevo',
          data.prioridad || 'media',
          data.activo !== false, // true por defecto
          data.comoLlego || 'No especificado',
          data.fechaPrimerContacto || new Date().toISOString().split('T')[0],
          data.proximoPaso?.trim() || null,
          data.notas?.trim() || null,
          data.vehiculosInteres || null,
          data.presupuestoMaximo || null,
          data.kilometrajeMaximo || null,
          data.añoMinimo || null,
          data.combustiblePreferido || 'cualquiera',
          data.cambioPreferido || 'cualquiera',
          data.formaPagoPreferida || 'cualquiera',
          data.coloresDeseados || null,
          data.etiquetas || null,
          data.necesidadesEspeciales?.trim() || null,
        ]
      )

      const cliente = result.rows[0]
      console.log('✅ [API CLIENTES] Cliente creado exitosamente:', cliente.id)

      return NextResponse.json(cliente, { status: 201 })
    } finally {
      client.release()
    }
  } catch (error) {
    console.error('❌ [API CLIENTES] Error al crear cliente:', error)
    const dbError = error as {
      code?: string
      constraint?: string
      message?: string
    }

    // Manejar errores específicos de la base de datos
    if (dbError.code === '23505') {
      // PostgreSQL unique violation error code
      if (dbError.constraint === 'Cliente_dni_key') {
        return NextResponse.json(
          {
            error:
              'Ya existe un cliente con este DNI. Por favor, verifica el número de documento.',
          },
          { status: 400 }
        )
      }
      return NextResponse.json(
        { error: 'Los datos proporcionados ya existen en el sistema.' },
        { status: 400 }
      )
    }

    // Manejar errores de formato de fecha/timestamp
    if (dbError.code === '22007') {
      return NextResponse.json(
        {
          error:
            'Error en el formato de fecha. Por favor, verifica las fechas ingresadas.',
        },
        { status: 400 }
      )
    }

    // Error genérico
    return NextResponse.json(
      {
        error: 'Error interno del servidor',
        details: dbError.message,
        timestamp: new Date().toISOString(),
      },
      { status: 500 }
    )
  }
}

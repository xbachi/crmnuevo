import { NextRequest, NextResponse } from 'next/server'
import { clearVehiculos, saveVehiculo } from '@/lib/direct-database'
import { requireAdminSession } from '@/lib/apiAuth'
import {
  extraerMatriculaEntrada,
  normalizarReferencia,
  validarMatricula,
} from '@/lib/normalizacion'

export async function POST(request: NextRequest) {
  const auth = requireAdminSession(request)
  if (auth.response) return auth.response

  try {
    const { data, confirmarBorrado } = await request.json()

    if (!data || !Array.isArray(data)) {
      return NextResponse.json(
        { error: 'Datos CSV inválidos' },
        { status: 400 }
      )
    }

    // La importación hace clearVehiculos(): exigimos confirmación explícita.
    if (confirmarBorrado !== true) {
      return NextResponse.json(
        {
          error:
            'Debes confirmar que se borrará todo el stock actual (confirmarBorrado)',
        },
        { status: 400 }
      )
    }

    console.log(`📥 Importando ${data.length} registros CSV...`)

    // Limpiar vehículos existentes
    await clearVehiculos()

    let imported = 0
    let extranjeras = 0
    const errors = []
    const avisos: string[] = []

    for (let i = 0; i < data.length; i++) {
      const row = data[i]

      try {
        // Debug: mostrar valores de estado y referencia
        if (i < 3) {
          // Solo los primeros 3 registros
          const referencia =
            row.referencia || row.REFERENCIA || row.Referencia || ''
          const tipoAsignado = referencia.startsWith('#')
            ? 'Compra'
            : referencia.startsWith('D-')
              ? 'Depósito'
              : referencia.startsWith('R-')
                ? 'R'
                : 'Compra'

          console.log(
            `🔍 Registro ${i + 1} - Estado: "${row.estado || row.ESTADO || row.Estado || ''}" - Ref: "${referencia}" - Tipo: "${tipoAsignado}"`
          )
          console.log(`   📋 Info adicional:`)
          console.log(`     - 2DA LLAVE: "${row['2DA LLAVE'] || 'N/A'}"`)
          console.log(`     - CARPETA: "${row.CARPETA || 'N/A'}"`)
          console.log(`     - MASTER: "${row.MASTER || 'N/A'}"`)
          console.log(`     - HOJAS A: "${row['HOJAS A'] || 'N/A'}"`)
          console.log(`     - DOCU: "${row.DOCU || 'N/A'}"`)
          console.log(`     - ITV: "${row.ITV || 'N/A'}"`)
          console.log(`     - SEGURO: "${row.SEGURO || 'N/A'}"`)
        }

        // Mapear columnas del CSV a campos de la base de datos
        const vehiculo = {
          referencia: row.referencia || row.REFERENCIA || row.Referencia || '',
          marca: row.marca || row.MARCA || row.Marca || '',
          modelo: row.modelo || row.MODELO || row.Modelo || '',
          matricula: row.matricula || row.MATRICULA || row.Matricula || '',
          bastidor: row.bastidor || row.BASTIDOR || row.Bastidor || '',
          kms:
            parseInt(
              row.kms ||
                row.KMS ||
                row.Kms ||
                row.kilometros ||
                row.KILOMETROS ||
                '0'
            ) || 0,
          tipo: (() => {
            const referencia =
              row.referencia || row.REFERENCIA || row.Referencia || ''
            if (referencia.startsWith('#')) {
              return 'Compra'
            } else if (referencia.startsWith('D-')) {
              return 'Depósito'
            } else if (referencia.startsWith('R-')) {
              return 'R'
            } else {
              // Si no coincide con ningún patrón, usar el valor del CSV o 'Compra' por defecto
              return row.tipo || row.TIPO || row.Tipo || 'Compra'
            }
          })(),
          estado: (() => {
            const estadoValue = row.estado || row.ESTADO || row.Estado || ''
            return estadoValue === '' ? '' : estadoValue.toLowerCase()
          })(),
          orden: 0,

          // Campos adicionales de Google Sheets
          fechaMatriculacion:
            row['FECHA MATRI'] ||
            row.fechaMatriculacion ||
            row.FECHA_MATRICULACION ||
            '',
          año:
            parseInt(
              row.año || row.ANO || row.AÑO || row.year || row.YEAR || ''
            ) || null,
          itv: row.ITV || row.itv || '',
          seguro: row.SEGURO || row.seguro || '',
          segundaLlave:
            row['2DA LLAVE'] ||
            row.segundaLlave ||
            row.SEGUNDA_LLAVE ||
            row.segunda_llave ||
            '',
          documentacion:
            row.DOCU ||
            row.documentacion ||
            row.DOCUMENTACION ||
            row.DOCUMENTACIÓN ||
            '',
          carpeta: row.CARPETA || row.carpeta || '',
          master: row.MASTER || row.master || '',
          hojasA:
            row['HOJAS A'] || row.hojasA || row.HOJAS_A || row.hojas_a || '',

          // Campos de inversor (opcional)
          esCocheInversor:
            row.esCocheInversor === 'true' ||
            row.es_coche_inversor === 'true' ||
            false,
          inversorId: row.inversorId ? parseInt(row.inversorId) : null,
          fechaCompra: row.fechaCompra ? new Date(row.fechaCompra) : null,
          precioCompra: row.precioCompra ? parseFloat(row.precioCompra) : null,
          gastosTransporte: row.gastosTransporte
            ? parseFloat(row.gastosTransporte)
            : null,
          gastosTasas: row.gastosTasas ? parseFloat(row.gastosTasas) : null,
          gastosMecanica: row.gastosMecanica
            ? parseFloat(row.gastosMecanica)
            : null,
          gastosPintura: row.gastosPintura
            ? parseFloat(row.gastosPintura)
            : null,
          gastosLimpieza: row.gastosLimpieza
            ? parseFloat(row.gastosLimpieza)
            : null,
          gastosOtros: row.gastosOtros ? parseFloat(row.gastosOtros) : null,
          precioPublicacion: row.precioPublicacion
            ? parseFloat(row.precioPublicacion)
            : null,
          precioVenta: row.precioVenta ? parseFloat(row.precioVenta) : null,
          beneficioNeto: row.beneficioNeto
            ? parseFloat(row.beneficioNeto)
            : null,
          notasInversor: row.notasInversor || '',
          fotoInversor: row.fotoInversor || '',
        }

        // Validar campos requeridos
        if (
          !vehiculo.referencia ||
          !vehiculo.marca ||
          !vehiculo.modelo ||
          !vehiculo.matricula ||
          !vehiculo.bastidor
        ) {
          errors.push(
            `Fila ${i + 1}: Faltan campos requeridos (referencia, marca, modelo, matrícula, bastidor)`
          )
          continue
        }

        // Misma normalización que POST /api/vehiculos. La referencia no
        // bloquea (se conserva cruda con aviso); la matrícula sí.
        const referenciaCanon = normalizarReferencia(
          vehiculo.referencia,
          vehiculo.tipo
        )
        if (!referenciaCanon) {
          avisos.push(
            `Fila ${i + 1}: referencia '${vehiculo.referencia}' no reconocida, se guarda tal cual`
          )
        }
        vehiculo.referencia = referenciaCanon ?? vehiculo.referencia
        vehiculo.matricula = extraerMatriculaEntrada(vehiculo.matricula)
        const extranjera = /^(si|sí|s|true|1|x)$/i.test(
          String(
            row.matriculaExtranjera ??
              row.MATRICULA_EXTRANJERA ??
              row['Matricula Extranjera'] ??
              ''
          ).trim()
        )
        if (!validarMatricula(vehiculo.matricula, { extranjera }).ok) {
          errors.push(
            `Fila ${i + 1}: matrícula '${vehiculo.matricula}' no válida; añade columna matriculaExtranjera=SI si es extranjera`
          )
          continue
        }
        if (extranjera) extranjeras++

        // Agregar vehículo
        await saveVehiculo(vehiculo)
        imported++
      } catch (error) {
        console.error(`Error procesando fila ${i + 1}:`, error)
        errors.push(
          `Fila ${i + 1}: ${error instanceof Error ? error.message : 'Error desconocido'}`
        )
      }
    }

    console.log(
      `✅ Importación completada: ${imported} vehículos importados, ${errors.length} errores`
    )

    return NextResponse.json({
      success: true,
      imported,
      extranjeras,
      errors: errors.length,
      errorDetails: errors.slice(0, 10), // Solo los primeros 10 errores
      avisos: avisos.slice(0, 10),
      message: `Importación completada: ${imported} vehículos importados${errors.length > 0 ? `, ${errors.length} errores` : ''}`,
    })
  } catch (error) {
    console.error('Error importando CSV:', error)
    return NextResponse.json(
      { error: 'Error al importar los datos CSV' },
      { status: 500 }
    )
  }
}

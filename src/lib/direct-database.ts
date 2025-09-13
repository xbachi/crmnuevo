// Conexión directa a PostgreSQL sin Prisma para evitar problemas del pooler
import { Pool } from 'pg'

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false
  }
})

export interface Vehiculo {
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
  createdAt: Date
  updatedAt: Date
  color?: string | null
  fechaMatriculacion?: string | null
  año?: number | null
  itv?: string | null
  seguro?: string | null
  segundaLlave?: string | null
  documentacion?: string | null
  carpeta?: string | null
  master?: string | null
  hojasA?: string | null
  esCocheInversor?: boolean
  inversorId?: number | null
  inversor?: {
    id: number
    nombre: string
  } | null
  fechaCompra?: Date | null
  precioCompra?: number | null
  gastosTransporte?: number | null
  gastosTasas?: number | null
  gastosMecanica?: number | null
  gastosPintura?: number | null
  gastosLimpieza?: number | null
  gastosOtros?: number | null
  precioPublicacion?: number | null
  precioVenta?: number | null
  beneficioNeto?: number | null
  notasInversor?: string | null
  fotoInversor?: string | null
}

export async function getVehiculos(limit?: number, offset?: number): Promise<Vehiculo[]> {
  const client = await pool.connect()
  try {
    // Consulta optimizada: solo campos necesarios para la lista
    const limitClause = limit ? `LIMIT ${limit}` : ''
    const offsetClause = offset ? `OFFSET ${offset}` : ''
    
    const result = await client.query(`
      SELECT 
        v.id, v.referencia, v.marca, v.modelo, v.matricula, v.bastidor, 
        v.kms, v.tipo, v.estado, v.orden, v."createdAt", v."updatedAt",
        v.color, v."fechaMatriculacion", v.año, v."esCocheInversor", 
        v."inversorId", v."fechaCompra", v."precioCompra", v."gastosTransporte",
        v."gastosTasas", v."gastosMecanica", v."gastosPintura", v."gastosLimpieza",
        v."gastosOtros", v."precioPublicacion", v."precioVenta", v."beneficioNeto",
        v."notasInversor", v."fotoInversor", i.nombre as inversor_nombre 
      FROM "Vehiculo" v
      LEFT JOIN "Inversor" i ON v."inversorId" = i.id
      ORDER BY v."createdAt" DESC, v.id DESC
      ${limitClause} ${offsetClause}
    `)
    
    return result.rows.map(row => ({
      id: row.id,
      referencia: row.referencia,
      marca: row.marca,
      modelo: row.modelo,
      matricula: row.matricula,
      bastidor: row.bastidor,
      kms: row.kms,
      tipo: row.tipo,
      estado: row.estado,
      orden: row.orden,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      color: row.color,
      fechaMatriculacion: row.fechaMatriculacion,
      año: row.año,
      esCocheInversor: row.esCocheInversor,
      inversorId: row.inversorId,
      inversor: row.inversor_nombre ? {
        id: row.inversorId,
        nombre: row.inversor_nombre
      } : null,
      fechaCompra: row.fechaCompra,
      precioCompra: row.precioCompra,
      gastosTransporte: row.gastosTransporte,
      gastosTasas: row.gastosTasas,
      gastosMecanica: row.gastosMecanica,
      gastosPintura: row.gastosPintura,
      gastosLimpieza: row.gastosLimpieza,
      gastosOtros: row.gastosOtros,
      precioPublicacion: row.precioPublicacion,
      precioVenta: row.precioVenta,
      beneficioNeto: row.beneficioNeto,
      notasInversor: row.notasInversor,
      fotoInversor: row.fotoInversor
    }))
  } catch (error) {
    console.error('Error obteniendo vehículos:', error)
    return []
  } finally {
    client.release()
  }
}

export async function getVehiculosCount(): Promise<number> {
  const client = await pool.connect()
  try {
    const result = await client.query('SELECT COUNT(*) as count FROM "Vehiculo"')
    return parseInt(result.rows[0].count)
  } catch (error) {
    console.error('Error obteniendo conteo de vehículos:', error)
    return 0
  } finally {
    client.release()
  }
}

export async function getVehiculoById(id: number): Promise<Vehiculo | null> {
  const client = await pool.connect()
  try {
    const result = await client.query(`
      SELECT v.*, i.nombre as inversor_nombre 
      FROM "Vehiculo" v
      LEFT JOIN "Inversor" i ON v."inversorId" = i.id
      WHERE v.id = $1
    `, [id])
    
    if (result.rows.length === 0) return null
    
    const row = result.rows[0]
    return {
      id: row.id,
      referencia: row.referencia,
      marca: row.marca,
      modelo: row.modelo,
      matricula: row.matricula,
      bastidor: row.bastidor,
      kms: row.kms,
      tipo: row.tipo,
      estado: row.estado,
      orden: row.orden,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      fechaMatriculacion: row.fechaMatriculacion,
      año: row.año,
      itv: row.itv,
      seguro: row.seguro,
      segundaLlave: row.segundaLlave,
      documentacion: row.documentacion,
      carpeta: row.carpeta,
      master: row.master,
      hojasA: row.hojasA,
      esCocheInversor: row.esCocheInversor,
      inversorId: row.inversorId,
      inversor: row.inversor_nombre ? {
        id: row.inversorId,
        nombre: row.inversor_nombre
      } : null,
      fechaCompra: row.fechaCompra,
      precioCompra: row.precioCompra,
      gastosTransporte: row.gastosTransporte,
      gastosTasas: row.gastosTasas,
      gastosMecanica: row.gastosMecanica,
      gastosPintura: row.gastosPintura,
      gastosLimpieza: row.gastosLimpieza,
      gastosOtros: row.gastosOtros,
      precioPublicacion: row.precioPublicacion,
      precioVenta: row.precioVenta,
      beneficioNeto: row.beneficioNeto,
      notasInversor: row.notasInversor,
      fotoInversor: row.fotoInversor
    }
  } catch (error) {
    console.error('Error obteniendo vehículo por ID:', error)
    return null
  } finally {
    client.release()
  }
}

export async function saveVehiculo(vehiculoData: Omit<Vehiculo, 'id' | 'createdAt' | 'updatedAt'>): Promise<Vehiculo> {
  const client = await pool.connect()
  try {
    const result = await client.query(`
      INSERT INTO "Vehiculo" (
        referencia, marca, modelo, matricula, bastidor, kms, tipo, estado, orden,
        color, "fechaMatriculacion", año, itv, seguro, "segundaLlave", documentacion,
        carpeta, master, "hojasA", "esCocheInversor", "inversorId",
        "fechaCompra", "precioCompra", "gastosTransporte", "gastosTasas",
        "gastosMecanica", "gastosPintura", "gastosLimpieza", "gastosOtros",
        "precioPublicacion", "precioVenta", "beneficioNeto", "notasInversor",
        "fotoInversor", "createdAt", "updatedAt"
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21,
        $22, $23, $24, $25, $26, $27, $28, $29, $30, $31, $32, $33, $34, NOW(), NOW()
      ) RETURNING *
    `, [
      vehiculoData.referencia, vehiculoData.marca, vehiculoData.modelo,
      vehiculoData.matricula, vehiculoData.bastidor, vehiculoData.kms,
      vehiculoData.tipo, vehiculoData.estado, vehiculoData.orden,
      vehiculoData.color, vehiculoData.fechaMatriculacion, vehiculoData.año, vehiculoData.itv,
      vehiculoData.seguro, vehiculoData.segundaLlave, vehiculoData.documentacion,
      vehiculoData.carpeta, vehiculoData.master, vehiculoData.hojasA,
      vehiculoData.esCocheInversor, vehiculoData.inversorId,
      vehiculoData.fechaCompra, vehiculoData.precioCompra, vehiculoData.gastosTransporte,
      vehiculoData.gastosTasas, vehiculoData.gastosMecanica, vehiculoData.gastosPintura,
      vehiculoData.gastosLimpieza, vehiculoData.gastosOtros, vehiculoData.precioPublicacion,
      vehiculoData.precioVenta, vehiculoData.beneficioNeto, vehiculoData.notasInversor,
      vehiculoData.fotoInversor
    ])
    
    return result.rows[0] as Vehiculo
  } catch (error) {
    console.error('Error guardando vehículo:', error)
    throw error
  } finally {
    client.release()
  }
}

export async function clearVehiculos(): Promise<boolean> {
  const client = await pool.connect()
  try {
    await client.query('DELETE FROM "Vehiculo"')
    return true
  } catch (error) {
    console.error('Error limpiando vehículos:', error)
    throw error
  } finally {
    client.release()
  }
}

export async function deleteVehiculo(id: number): Promise<boolean> {
  const client = await pool.connect()
  try {
    await client.query('DELETE FROM "Vehiculo" WHERE id = $1', [id])
    return true
  } catch (error) {
    console.error('Error eliminando vehículo:', error)
    return false
  } finally {
    client.release()
  }
}

export async function updateVehiculo(id: number, vehiculoData: Partial<Vehiculo>): Promise<Vehiculo | null> {
  const client = await pool.connect()
  try {
    const fields = Object.keys(vehiculoData).filter(key => key !== 'id')
    const values = fields.map(field => vehiculoData[field as keyof Vehiculo])
    const setClause = fields.map((field, index) => `"${field}" = $${index + 2}`).join(', ')
    
    console.log('🔄 Actualizando vehículo ID:', id)
    console.log('📋 Campos a actualizar:', fields)
    console.log('💾 Valores:', values)
    console.log('🔧 SET clause:', setClause)
    console.log('🔍 vehiculoData completo:', vehiculoData)
    
    const result = await client.query(`
      UPDATE "Vehiculo" 
      SET ${setClause}, "updatedAt" = NOW()
      WHERE id = $1 
      RETURNING *
    `, [id, ...values])
    
    console.log('✅ Resultado de actualización:', result.rows[0])
    console.log('✅ Número de filas afectadas:', result.rowCount)
    console.log('✅ Resultado completo:', result)
    
    return result.rows[0] as Vehiculo || null
  } catch (error) {
    console.error('Error actualizando vehículo:', error)
    throw error
  } finally {
    client.release()
  }
}

export async function getInversores() {
  const client = await pool.connect()
  try {
    const result = await client.query('SELECT * FROM "Inversor" ORDER BY id ASC')
    return result.rows
  } catch (error) {
    console.error('Error obteniendo inversores:', error)
    return []
  } finally {
    client.release()
  }
}

export async function saveInversor(inversorData: any) {
  const client = await pool.connect()
  try {
    const result = await client.query(`
      INSERT INTO "Inversor" (
        nombre, email, "capitalAportado", "fechaAporte", "capitalInvertido", 
        "notasInternas", "createdAt", "updatedAt"
      )
      VALUES ($1, $2, $3, $4, $5, $6, NOW(), NOW())
      RETURNING *
    `, [
      inversorData.nombre, 
      inversorData.email, 
      inversorData.capitalAportado || 0,
      inversorData.fechaAporte,
      inversorData.capitalInvertido || 0,
      inversorData.notasInternas
    ])
    return result.rows[0]
  } catch (error) {
    console.error('Error guardando inversor:', error)
    throw error
  } finally {
    client.release()
  }
}

export async function checkUniqueFields(referencia: string, matricula: string, bastidor: string, excludeId?: number) {
  const client = await pool.connect()
  try {
    let query = `
      SELECT referencia, matricula, bastidor 
      FROM "Vehiculo" 
      WHERE (referencia = $1 OR matricula = $2 OR bastidor = $3)
    `
    const params = [referencia, matricula, bastidor]
    
    if (excludeId) {
      query += ' AND id != $4'
      params.push(excludeId)
    }
    
    const result = await client.query(query, params)
    
    if (result.rows.length > 0) {
      const existing = result.rows[0]
      if (existing.referencia === referencia) {
        return { field: 'referencia', value: referencia }
      }
      if (existing.matricula === matricula) {
        return { field: 'matrícula', value: matricula }
      }
      if (existing.bastidor === bastidor) {
        return { field: 'bastidor', value: bastidor }
      }
    }
    
    return null
  } catch (error) {
    console.error('Error verificando campos únicos:', error)
    return null
  } finally {
    client.release()
  }
}

// Funciones para clientes
export async function getClientes() {
  const client = await pool.connect()
  try {
    const result = await client.query('SELECT * FROM "Cliente" ORDER BY id ASC')
    return result.rows
  } catch (error) {
    console.error('Error obteniendo clientes:', error)
    return []
  } finally {
    client.release()
  }
}

export async function saveCliente(clienteData: any) {
  const client = await pool.connect()
  try {
    const result = await client.query(`
      INSERT INTO "Cliente" (
        nombre, apellidos, email, telefono, "fechaNacimiento", direccion,
        ciudad, "codigoPostal", provincia, dni, "vehiculosInteres",
        "presupuestoMaximo", "kilometrajeMaximo", "añoMinimo", 
        "combustiblePreferido", "cambioPreferido", "coloresDeseados",
        "necesidadesEspeciales", "formaPagoPreferida", "comoLlego",
        "fechaPrimerContacto", estado, prioridad, "proximoPaso",
        etiquetas, "notasAdicionales", observaciones, activo,
        "createdAt", "updatedAt"
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26, $27, $28, NOW(), NOW()
      ) RETURNING *
    `, [
      clienteData.nombre, clienteData.apellidos, clienteData.email,
      clienteData.telefono, clienteData.fechaNacimiento, clienteData.direccion,
      clienteData.ciudad, clienteData.codigoPostal, clienteData.provincia,
      clienteData.dni, clienteData.vehiculosInteres, clienteData.presupuestoMaximo,
      clienteData.kilometrajeMaximo, clienteData.añoMinimo, clienteData.combustiblePreferido,
      clienteData.cambioPreferido, clienteData.coloresDeseados, clienteData.necesidadesEspeciales,
      clienteData.formaPagoPreferida, clienteData.comoLlego, clienteData.fechaPrimerContacto,
      clienteData.estado, clienteData.prioridad, clienteData.proximoPaso,
      clienteData.etiquetas, clienteData.notasAdicionales, clienteData.observaciones,
      clienteData.activo
    ])
    return result.rows[0]
  } catch (error) {
    console.error('Error guardando cliente:', error)
    throw error
  } finally {
    client.release()
  }
}

export async function getClienteById(id: number) {
  const client = await pool.connect()
  try {
    const result = await client.query('SELECT * FROM "Cliente" WHERE id = $1', [id])
    return result.rows[0] || null
  } catch (error) {
    console.error('Error obteniendo cliente por ID:', error)
    return null
  } finally {
    client.release()
  }
}

export async function updateCliente(id: number, clienteData: any) {
  const client = await pool.connect()
  try {
    // Campos válidos según el esquema de la base de datos actualizado
    const validFields = [
      'nombre', 'apellidos', 'email', 'telefono', 'fechaNacimiento', 
      'direccion', 'ciudad', 'codigoPostal', 'provincia', 'dni',
      'vehiculosInteres', 'presupuestoMaximo', 'kilometrajeMaximo', 
      'añoMinimo', 'combustiblePreferido', 'cambioPreferido',
      'coloresDeseados', 'necesidadesEspeciales', 'formaPagoPreferida',
      'comoLlego', 'fechaPrimerContacto', 'estado', 'prioridad',
      'proximoPaso', 'etiquetas', 'notasAdicionales', 'observaciones', 'activo'
    ]
    
    // Filtrar solo campos válidos
    const fields = Object.keys(clienteData).filter(key => 
      key !== 'id' && validFields.includes(key)
    )
    
    // Si no hay campos válidos, no hacer nada
    if (fields.length === 0) {
      return await getClienteById(id)
    }
    
    const values = fields.map(field => clienteData[field])
    const setClause = fields.map((field, index) => `"${field}" = $${index + 2}`).join(', ')
    
    const result = await client.query(`
      UPDATE "Cliente" 
      SET ${setClause}, "updatedAt" = NOW()
      WHERE id = $1 
      RETURNING *
    `, [id, ...values])
    
    return result.rows[0] || null
  } catch (error) {
    console.error('Error actualizando cliente:', error)
    throw error
  } finally {
    client.release()
  }
}

export async function deleteCliente(id: number) {
  const client = await pool.connect()
  try {
    await client.query('DELETE FROM "Cliente" WHERE id = $1', [id])
    return true
  } catch (error) {
    console.error('Error eliminando cliente:', error)
    return false
  } finally {
    client.release()
  }
}

// Funciones para inversores adicionales
export async function getInversorById(id: number) {
  const client = await pool.connect()
  try {
    const result = await client.query('SELECT * FROM "Inversor" WHERE id = $1', [id])
    return result.rows[0] || null
  } catch (error) {
    console.error('Error obteniendo inversor por ID:', error)
    return null
  } finally {
    client.release()
  }
}

export async function updateInversor(id: number, inversorData: any) {
  const client = await pool.connect()
  try {
    const fields = Object.keys(inversorData).filter(key => key !== 'id')
    const values = fields.map(field => inversorData[field])
    const setClause = fields.map((field, index) => `"${field}" = $${index + 2}`).join(', ')
    
    const result = await client.query(`
      UPDATE "Inversor" 
      SET ${setClause}, "updatedAt" = NOW()
      WHERE id = $1 
      RETURNING *
    `, [id, ...values])
    
    return result.rows[0] || null
  } catch (error) {
    console.error('Error actualizando inversor:', error)
    throw error
  } finally {
    client.release()
  }
}

export async function deleteInversor(id: number) {
  const client = await pool.connect()
  try {
    await client.query('DELETE FROM "Inversor" WHERE id = $1', [id])
    return true
  } catch (error) {
    console.error('Error eliminando inversor:', error)
    return false
  } finally {
    client.release()
  }
}

export async function getVehiculosByInversor(inversorId: number) {
  const client = await pool.connect()
  try {
    const result = await client.query(`
      SELECT * FROM "Vehiculo" 
      WHERE "inversorId" = $1 
      ORDER BY id ASC
    `, [inversorId])
    return result.rows
  } catch (error) {
    console.error('Error obteniendo vehículos por inversor:', error)
    return []
  } finally {
    client.release()
  }
}

export async function updateVehiculosOrden(updates: any[]) {
  const client = await pool.connect()
  try {
    const results = []
    for (const update of updates) {
      const result = await client.query(`
        UPDATE "Vehiculo" 
        SET estado = $2, orden = $3, "updatedAt" = NOW()
        WHERE id = $1 
        RETURNING *
      `, [update.id, update.estado, update.orden])
      
      if (result.rows[0]) {
        results.push(result.rows[0])
      }
    }
    return results
  } catch (error) {
    console.error('Error actualizando orden de vehículos:', error)
    throw error
  } finally {
    client.release()
  }
}

// Funciones para notas
export async function getNotasByCliente(clienteId: number) {
  const client = await pool.connect()
  try {
    const result = await client.query(`
      SELECT * FROM "NotaCliente" 
      WHERE "clienteId" = $1 
      ORDER BY fecha DESC
    `, [clienteId])
    return result.rows
  } catch (error) {
    console.error('Error obteniendo notas del cliente:', error)
    return []
  } finally {
    client.release()
  }
}

export async function addNotaCliente(notaData: any) {
  const client = await pool.connect()
  try {
    const result = await client.query(`
      INSERT INTO "NotaCliente" (
        "clienteId", tipo, contenido, prioridad, completada,
        "createdAt", "updatedAt"
      ) VALUES (
        $1, $2, $3, $4, $5, NOW(), NOW()
      ) RETURNING *
    `, [
      notaData.clienteId, notaData.tipo, notaData.contenido,
      notaData.prioridad, notaData.completada || false
    ])
    return result.rows[0]
  } catch (error) {
    console.error('Error agregando nota del cliente:', error)
    throw error
  } finally {
    client.release()
  }
}

// Funciones adicionales
export async function buscarClientesPorVehiculo(vehiculoInfo: string) {
  const client = await pool.connect()
  try {
    const result = await client.query(`
      SELECT * FROM "Cliente" 
      WHERE "vehiculosInteres" ILIKE $1 
      ORDER BY id ASC
    `, [`%${vehiculoInfo}%`])
    return result.rows
  } catch (error) {
    console.error('Error buscando clientes por vehículo:', error)
    return []
  } finally {
    client.release()
  }
}

export async function getInversorMetrics(inversorId: number) {
  const client = await pool.connect()
  try {
    // Obtener datos del inversor
    const inversorResult = await client.query(`
      SELECT "capitalAportado", "capitalInvertido"
      FROM "Inversor" 
      WHERE id = $1
    `, [inversorId])
    
    const inversor = inversorResult.rows[0]
    if (!inversor) {
      throw new Error('Inversor no encontrado')
    }
    
    // Obtener métricas de vehículos con costo total calculado
    const vehiculosResult = await client.query(`
      SELECT 
        COUNT(*) as total_vehiculos,
        COUNT(CASE WHEN estado = 'VENDIDO' THEN 1 END) as total_vendidos,
        COUNT(CASE WHEN estado != 'VENDIDO' THEN 1 END) as total_en_stock,
        SUM("precioVenta") as total_vendido,
        SUM("beneficioNeto") as beneficio_total,
        AVG("beneficioNeto") as beneficio_promedio,
        -- Calcular costo total real de todos los vehículos
        SUM(
          COALESCE("precioCompra", 0) + 
          COALESCE("gastosTransporte", 0) + 
          COALESCE("gastosTasas", 0) + 
          COALESCE("gastosMecanica", 0) + 
          COALESCE("gastosPintura", 0) + 
          COALESCE("gastosLimpieza", 0) + 
          COALESCE("gastosOtros", 0)
        ) as total_costo_real
      FROM "Vehiculo" 
      WHERE "inversorId" = $1
    `, [inversorId])
    
    const metrics = vehiculosResult.rows[0]
    
    // Calcular valores
    const capitalAportado = parseFloat(inversor.capitalAportado) || 0
    const capitalInvertidoReal = parseFloat(metrics.total_costo_real) || 0 // Capital realmente invertido en vehículos
    const capitalDisponible = capitalAportado - capitalInvertidoReal // Puede ser negativo
    const beneficioAcumulado = parseFloat(metrics.beneficio_total) || 0
    const roi = capitalInvertidoReal > 0 ? (beneficioAcumulado / capitalInvertidoReal) * 100 : 0
    
    return {
      beneficioAcumulado: beneficioAcumulado,
      capitalInvertido: capitalInvertidoReal, // Capital realmente invertido en vehículos
      capitalAportado: capitalAportado,
      capitalDisponible: capitalDisponible, // Puede ser negativo
      roi: roi,
      totalVendidos: parseInt(metrics.total_vendidos) || 0,
      totalEnStock: parseInt(metrics.total_en_stock) || 0,
      diasPromedioEnStock: 0 // TODO: Implementar cálculo de días promedio
    }
  } catch (error) {
    console.error('Error obteniendo métricas del inversor:', error)
    return {
      beneficioAcumulado: 0,
      capitalInvertido: 0,
      capitalAportado: 0,
      capitalDisponible: 0,
      roi: 0,
      totalVendidos: 0,
      totalEnStock: 0,
      diasPromedioEnStock: 0
    }
  } finally {
    client.release()
  }
}

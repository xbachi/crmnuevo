/**
 * @jest-environment node
 *
 * La lista de Ventas tiene que ser LITERALMENTE todas las ventas: retail
 * (Deal) + B2B (venta_b2b). Que estuvieran en módulos separados hizo que un
 * mismo coche se facturara dos veces (R-2026-025 desde el deal y R-2026-026
 * desde la venta B2B).
 *
 * Sin DB en los tests unitarios: se verifica el SQL que se emite (mismo patrón
 * que __tests__/api/rectificativaConteos.test.ts) + el mapeo de filas.
 */

import {
  ACTIVE_INVOICE_STATUSES,
  VOID_INVOICE_STATUSES,
  buildVentasUnificadasQuery,
  mapVentaRow,
  parseVentasFiltros,
  periodosDe,
  type VentaRowDb,
  type VentasFiltros,
} from '@/lib/ventasUnificadas'

const filtros = (over: Partial<VentasFiltros> = {}): VentasFiltros => ({
  tipo: 'todas',
  estado: 'todos',
  q: '',
  desde: null,
  hasta: null,
  page: 1,
  pageSize: 25,
  now: new Date('2026-07-11T10:00:00Z'),
  ...over,
})

const row = (over: Partial<VentaRowDb> = {}): VentaRowDb => ({
  tipo: 'retail',
  id: 149,
  numero: 'D-149',
  fecha: '2026-06-30',
  estado: 'facturado',
  importe: '8700.00',
  cliente: 'Juan Pérez',
  cliente_id: 12,
  marca: 'VW',
  modelo: 'Eos',
  matricula: '8700GKW',
  factura_numero: 'R-2026-025',
  facturada: true,
  anulada: false,
  cuenta_venta: true,
  ...over,
})

describe('buildVentasUnificadasQuery — una sola query, las dos vías', () => {
  it('une Deal y venta_b2b con UNION ALL (no dos fetch + merge en cliente)', () => {
    const { sql } = buildVentasUnificadasQuery(filtros())
    expect(sql).toContain('UNION ALL')
    expect(sql).toContain('FROM "Deal" d')
    expect(sql).toContain('FROM venta_b2b vb')
    expect(sql).toContain("'retail'::text AS tipo")
    expect(sql).toContain("'b2b'::text AS tipo")
  })

  it('ordena por fecha desc y pagina en SQL (LIMIT/OFFSET, no en JS)', () => {
    const { sql, params } = buildVentasUnificadasQuery(
      filtros({ page: 3, pageSize: 25 })
    )
    expect(sql).toContain('ORDER BY fecha DESC NULLS LAST')
    expect(sql).toContain('LIMIT $8 OFFSET $9')
    expect(params[7]).toBe(25)
    expect(params[8]).toBe(50) // (page 3 - 1) * 25
  })

  it('acota el pageSize al máximo permitido', () => {
    const { params } = buildVentasUnificadasQuery(filtros({ pageSize: 5000 }))
    expect(params[7]).toBe(100)
  })

  it('el filtro por tipo viaja como parámetro y se aplica en SQL', () => {
    const retail = buildVentasUnificadasQuery(filtros({ tipo: 'retail' }))
    expect(retail.params[2]).toBe('retail')
    expect(retail.sql).toContain("($3 = 'todas' OR cf.tipo = $3)")

    const b2b = buildVentasUnificadasQuery(filtros({ tipo: 'b2b' }))
    expect(b2b.params[2]).toBe('b2b')

    const todas = buildVentasUnificadasQuery(filtros({ tipo: 'todas' }))
    expect(todas.params[2]).toBe('todas')
  })

  it('el filtro por estado incluye "anulado" y excluye anuladas del resto', () => {
    const { sql, params } = buildVentasUnificadasQuery(
      filtros({ estado: 'facturado' })
    )
    expect(params[3]).toBe('facturado')
    expect(sql).toContain("($4 = 'anulado' AND cf.anulada)")
    expect(sql).toContain("($4 <> 'anulado' AND cf.estado = $4 AND NOT cf.anulada)")
  })

  it('la búsqueda va en SQL sobre nº, cliente, vehículo, matrícula y factura', () => {
    const { sql, params } = buildVentasUnificadasQuery(filtros({ q: ' eos ' }))
    expect(params[4]).toBe('eos')
    expect(sql).toContain('cf.matricula')
    expect(sql).toContain('ILIKE')
  })
})

describe('criterio fiscal — anuladas/rectificadas no inflan los conteos', () => {
  it('factura activa = ISSUED/IMPORTED/PDF_PENDING y nunca RECTIFYING', () => {
    const { sql, params } = buildVentasUnificadasQuery(filtros())
    expect(params[0]).toEqual(['ISSUED', 'IMPORTED', 'PDF_PENDING'])
    expect(ACTIVE_INVOICE_STATUSES).not.toContain('RECTIFIED')
    expect(sql).toContain("i.invoice_type <> 'RECTIFYING'")
    expect(sql).toContain('i.status = ANY($1::text[])')
  })

  it('una venta cuya factura quedó RECTIFIED (o VOIDED) se marca anulada', () => {
    const { sql, params } = buildVentasUnificadasQuery(filtros())
    expect(params[1]).toEqual(VOID_INVOICE_STATUSES)
    expect(VOID_INVOICE_STATUSES).toEqual(['RECTIFIED', 'VOIDED'])
    // sin factura activa + existe factura anulada → anulada
    expect(sql).toContain(
      '(fa.full_invoice_number IS NULL AND an.hit IS NOT NULL) AS anulada'
    )
    // …y una venta B2B con status ANULADO también
    expect(sql).toContain("vb.status = 'ANULADO'")
  })

  it('las anuladas quedan fuera de cuenta_venta → no suman en los totales', () => {
    const { sql } = buildVentasUnificadasQuery(filtros())
    expect(sql).toContain('(NOT u.anulada')
    expect(sql).toContain('AS cuenta_venta')
    // los KPIs de mes/trimestre filtran por cuenta_venta
    expect(sql).toMatch(/'mesVentas', COUNT\(\*\) FILTER \(\s*WHERE cuenta_venta/)
    expect(sql).toMatch(
      /'trimestreVentas', COUNT\(\*\) FILTER \(\s*WHERE cuenta_venta/
    )
  })

  it('una venta sin factura todavía sí cuenta (retail vendido / cualquier B2B)', () => {
    const { sql } = buildVentasUnificadasQuery(filtros())
    expect(sql.replace(/\s+/g, ' ')).toContain(
      "(u.facturada OR u.tipo = 'b2b' OR u.estado IN ('vendido', 'facturado'))"
    )
  })

  it('los KPIs de mes/trimestre agregan sobre las dos vías (con desglose B2B)', () => {
    const { sql } = buildVentasUnificadasQuery(filtros())
    // los agregados se calculan sobre con_flags (retail + B2B), no sobre Deal
    expect(sql).toContain('FROM con_flags')
    expect(sql).toContain("'mesB2B'")
    expect(sql).toContain("'trimestreB2B'")
    expect(sql).toContain("'sinFacturar', COUNT(*) FILTER (WHERE cuenta_venta AND NOT facturada)")
  })
})

describe('periodosDe', () => {
  it('mes y trimestre en curso, con el fin exclusivo', () => {
    expect(periodosDe(new Date('2026-07-11T10:00:00Z'))).toEqual({
      mesInicio: '2026-07-01',
      mesFin: '2026-08-01',
      trimestreInicio: '2026-07-01',
      trimestreFin: '2026-10-01',
    })
  })

  it('cruza el año correctamente (diciembre / 4T)', () => {
    expect(periodosDe(new Date('2026-12-20T10:00:00Z'))).toEqual({
      mesInicio: '2026-12-01',
      mesFin: '2027-01-01',
      trimestreInicio: '2026-10-01',
      trimestreFin: '2027-01-01',
    })
  })
})

describe('mapVentaRow — cada fila enlaza a su ficha real', () => {
  it('retail: tipo correcto y link al deal', () => {
    const v = mapVentaRow(row())
    expect(v.tipo).toBe('retail')
    expect(v.href).toBe('/deals/149')
    expect(v.key).toBe('retail-149')
    expect(v.vehiculo).toBe('VW Eos')
    expect(v.importe).toBe(8700)
    expect(v.facturada).toBe(true)
    expect(v.facturaNumero).toBe('R-2026-025')
  })

  it('B2B: tipo correcto y link a la ficha del cliente B2B', () => {
    const v = mapVentaRow(
      row({
        tipo: 'b2b',
        id: 1,
        numero: 'B2B-2026-0001',
        cliente: 'NGscuderia SL',
        cliente_id: 7,
        factura_numero: 'R-2026-026',
      })
    )
    expect(v.tipo).toBe('b2b')
    expect(v.numero).toBe('B2B-2026-0001')
    expect(v.href).toBe('/clientes-b2b/7')
    expect(v.key).toBe('b2b-1')
  })

  it('una venta sin factura aparece marcada como no facturada', () => {
    const v = mapVentaRow(
      row({
        estado: 'vendido',
        facturada: false,
        factura_numero: null,
        cuenta_venta: true,
      })
    )
    expect(v.facturada).toBe(false)
    expect(v.facturaNumero).toBeNull()
    expect(v.anulada).toBe(false)
    expect(v.cuentaVenta).toBe(true) // se vendió: cuenta aunque no esté facturada
  })

  it('una venta anulada (factura rectificada) se marca y no cuenta', () => {
    const v = mapVentaRow(
      row({ facturada: false, factura_numero: null, anulada: true, cuenta_venta: false })
    )
    expect(v.anulada).toBe(true)
    expect(v.cuentaVenta).toBe(false)
  })
})

describe('parseVentasFiltros', () => {
  it('acepta los valores válidos', () => {
    const f = parseVentasFiltros(
      new URLSearchParams('tipo=b2b&estado=facturado&q=eos&page=2&pageSize=10')
    )
    expect(f).toMatchObject({
      tipo: 'b2b',
      estado: 'facturado',
      q: 'eos',
      page: 2,
      pageSize: 10,
    })
  })

  it('cae a defaults seguros ante basura', () => {
    const f = parseVentasFiltros(
      new URLSearchParams('tipo=drop&estado=x&page=-3&pageSize=abc&desde=ayer')
    )
    expect(f).toMatchObject({
      tipo: 'todas',
      estado: 'todos',
      page: 1,
      pageSize: 25,
      desde: null,
    })
  })
})

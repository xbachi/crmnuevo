/**
 * Tests de extracción del nº canónico de factura (auditoría C-03).
 * Fixtures: filenames REALES de gasto_facturas, incluidos los pares duplicados
 * (misma factura archivada con dos nombres → MISMO canónico).
 */
import { extraerNumeroCanonico, normalizarNombreFactura } from '@/lib/facturaNumero'

describe('normalizarNombreFactura', () => {
  it('mayúsculas, sin extensión, espacios colapsados', () => {
    expect(normalizarNombreFactura('factura  fergo f260017.pdf')).toBe('FACTURA FERGO F260017')
    expect(normalizarNombreFactura('Factura.PDF')).toBe('FACTURA')
  })

  it('quita sufijos de copia: _2, (1), -copia, -copy (iterativo)', () => {
    expect(normalizarNombreFactura('FC26-179_2.pdf')).toBe('FC26-179')
    expect(normalizarNombreFactura('factura (1).pdf')).toBe('FACTURA')
    expect(normalizarNombreFactura('factura-fergo-F260017-copia.pdf')).toBe('FACTURA-FERGO-F260017')
    expect(normalizarNombreFactura('factura-mecauto_2 (1).pdf')).toBe('FACTURA-MECAUTO')
    expect(normalizarNombreFactura('limpieza - copy.pdf')).toBe('LIMPIEZA')
  })
})

describe('extraerNumeroCanonico — mecauto (FC26-NN)', () => {
  it('par duplicado real FC26-179 (Kona 6935KYC): dos nombres → mismo canónico', () => {
    const a = extraerNumeroCanonico('6935KYC-mecauto-factura-mecauto-6935KYC-Fra-FC26179', 'mecauto')
    const b = extraerNumeroCanonico('6935KYC-mecauto-factura-mecauto-FC26-179-HIUNDAY-KONA-6935KYC', 'mecauto')
    expect(a).toBe('FC26-179')
    expect(b).toBe('FC26-179')
  })

  it('par duplicado real FC26-181 (2320KNT)', () => {
    expect(extraerNumeroCanonico('2320KNT-mecauto-factura-mecauto-2320KNT-Fra-FC26181', 'mecauto')).toBe('FC26-181')
    expect(
      extraerNumeroCanonico('2320KNT-mecauto-factura-mecauto-FC26-181-FORD-TRANSIT-CONECT-2320KNT', 'mecauto')
    ).toBe('FC26-181')
  })

  it('par duplicado real FC26-182 (2521MNG)', () => {
    expect(extraerNumeroCanonico('2521MNG-mecauto-factura-mecauto-2521MNG-Fra-FC26182', 'mecauto')).toBe('FC26-182')
    expect(extraerNumeroCanonico('2521MNG-mecauto-factura-mecauto-FC26-182-MPI-2521MNG', 'mecauto')).toBe('FC26-182')
  })

  it('normaliza separadores y ceros a la izquierda: FC26 179 ≡ FC26-179 ≡ FC26179 ≡ FC26-0179', () => {
    expect(extraerNumeroCanonico('FC26 179', 'mecauto')).toBe('FC26-179')
    expect(extraerNumeroCanonico('FC26_179', 'mecauto')).toBe('FC26-179')
    expect(extraerNumeroCanonico('FC26-0179', 'mecauto')).toBe('FC26-179')
  })

  it('sufijo de copia no forma parte del nº: FC26-181_2 → FC26-181', () => {
    expect(extraerNumeroCanonico('factura-mecauto-FC26-181_2.pdf', 'mecauto')).toBe('FC26-181')
  })

  it('serie ambigua "FC26-D" (real: 112-31-03-2026-FC26-D) → null, jamás un nº dudoso', () => {
    expect(
      extraerNumeroCanonico('8061KRN-mecauto-factura-mecauto-112-31-03-2026-FC26-D-OPEL-ASTRA-8061KRN', 'mecauto')
    ).toBeNull()
    expect(
      extraerNumeroCanonico('6351LRG-mecauto-factura-mecauto-82-27-02-2026-FC26-D-DACIA-SANDERO-6351LRG', 'mecauto')
    ).toBeNull()
  })

  it('filename real sin nº (renombre genérico o migración) → null', () => {
    expect(extraerNumeroCanonico('5131MBM-mecauto-factura-mecauto', 'mecauto')).toBeNull()
    expect(extraerNumeroCanonico('SHEET2026-mecauto-7801MPN', 'mecauto')).toBeNull()
    expect(extraerNumeroCanonico('0703NLP-mecauto-factura-mecauto-FORD-KUGA-0703NLP_2', 'mecauto')).toBeNull()
  })

  it('dos números FC26 distintos en el mismo texto → ambiguo → null', () => {
    expect(extraerNumeroCanonico('FC26-179-y-FC26-180', 'mecauto')).toBeNull()
  })
})

describe('extraerNumeroCanonico — fergo (F260NNN)', () => {
  it('filenames reales', () => {
    expect(extraerNumeroCanonico('factura-fergo-F2600116-KIA-XCEED-0608NLF', 'fergo')).toBe('F2600116')
    expect(extraerNumeroCanonico('factura-fergo-F260017-SEAT-IBIZA-8121LBC', 'fergo')).toBe('F260017')
    expect(extraerNumeroCanonico('F2600113.pdf', 'fergo')).toBe('F2600113')
  })

  it('conserva ceros (F260017 ≠ F26017): el nº se toma literal', () => {
    expect(extraerNumeroCanonico('F260017', 'fergo')).toBe('F260017')
  })

  it('sin nº → null', () => {
    expect(extraerNumeroCanonico('factura-fergo-SEAT-IBIZA', 'fergo')).toBeNull()
  })
})

describe('extraerNumeroCanonico — world detailing (26/NN)', () => {
  it('filenames reales limpieza-26-NN → 26/NN', () => {
    expect(
      extraerNumeroCanonico('4798KDX-world-detailing-factura-limpieza-26-40-KIA-STONIC-4798KDX', 'world-detailing')
    ).toBe('26/40')
    expect(
      extraerNumeroCanonico('8061KRN-world-detailing-factura-limpieza-26-44-OPEL-ASTRA-8061KRN', 'world-detailing')
    ).toBe('26/44')
    expect(
      extraerNumeroCanonico('0608NLF-world-detailing-factura-limpieza-26-47-KIA-XCEED-0608NLF', 'world-detailing')
    ).toBe('26/47')
  })

  it('forma literal 26/NN', () => {
    expect(extraerNumeroCanonico('factura 26/45 world detailing', 'worlddetailing')).toBe('26/45')
  })

  it('renombres reales sin nº → null (no colisionan)', () => {
    expect(extraerNumeroCanonico('4798KDX-world-detailing-limpieza-4798KDX', 'world-detailing')).toBeNull()
    expect(
      extraerNumeroCanonico('8061KRN-world-detailing-factura-limpieza-OPEL-ASTRA-8061KRN', 'world-detailing')
    ).toBeNull()
    expect(extraerNumeroCanonico('SHEET2026-world-detailing-4798KDX', 'world-detailing')).toBeNull()
    expect(extraerNumeroCanonico('FACTURA-SEVENCARS-N43', 'worlddetailing')).toBeNull()
  })

  it('una fecha 26-03-2026 NO es un nº de factura → null', () => {
    expect(extraerNumeroCanonico('factura-limpieza-26-03-2026-OPEL', 'world-detailing')).toBeNull()
  })

  it('"26-NN" suelto solo se acepta con proveedor world explícito', () => {
    expect(extraerNumeroCanonico('factura-26-44-OPEL', 'world-detailing')).toBe('26/44')
    expect(extraerNumeroCanonico('factura-26-44-OPEL')).toBeNull() // proveedor desconocido → dudoso
  })
})

describe('extraerNumeroCanonico — nagini (ENERGIA-NNNN)', () => {
  it('extrae con separadores variados y conserva ceros', () => {
    expect(extraerNumeroCanonico('nagini-ENERGIA-0233.pdf', 'nagini')).toBe('ENERGIA-0233')
    expect(extraerNumeroCanonico('ENERGIA 0233', 'nagini')).toBe('ENERGIA-0233')
    expect(extraerNumeroCanonico('ENERGIA0233', 'nagini')).toBe('ENERGIA-0233')
  })

  it('sin dígitos → null', () => {
    expect(extraerNumeroCanonico('nagini-energia-luz', 'nagini')).toBeNull()
  })
})

describe('extraerNumeroCanonico — wallapop (FVM...)', () => {
  it('el guión no es significativo: FVM-2026-000123 ≡ FVM2026000123', () => {
    expect(extraerNumeroCanonico('wallapop-FVM-2026-000123.pdf', 'wallapop')).toBe('FVM2026000123')
    expect(extraerNumeroCanonico('FVM2026000123', 'wallapop')).toBe('FVM2026000123')
  })

  it('FVM sin nº detrás → null', () => {
    expect(extraerNumeroCanonico('factura-wallapop-FVM', 'wallapop')).toBeNull()
  })
})

describe('extraerNumeroCanonico — enterprise (E0...)', () => {
  it('E0 + dígitos largos', () => {
    expect(extraerNumeroCanonico('enterprise-E01234567.pdf', 'enterprise')).toBe('E01234567')
  })

  it('E0 corto (dudoso) → null', () => {
    expect(extraerNumeroCanonico('E0123', 'enterprise')).toBeNull()
  })
})

describe('extraerNumeroCanonico — sin proveedor (prueba todas las familias)', () => {
  it('un solo match inequívoco → lo devuelve', () => {
    expect(extraerNumeroCanonico('6935KYC-mecauto-factura-mecauto-FC26-179-HIUNDAY-KONA-6935KYC')).toBe('FC26-179')
    expect(extraerNumeroCanonico('factura-fergo-F2600116-KIA-XCEED-0608NLF')).toBe('F2600116')
  })

  it('números de familias distintas en el mismo texto → ambiguo → null', () => {
    expect(extraerNumeroCanonico('FC26-100-y-F260017')).toBeNull()
  })

  it('texto vacío o basura → null', () => {
    expect(extraerNumeroCanonico('')).toBeNull()
    expect(extraerNumeroCanonico('factura.pdf')).toBeNull()
  })
})

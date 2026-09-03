/** @jest-environment node */

import { safeEqual } from '@/lib/secrets'

describe('safeEqual', () => {
  it('iguales → true', () => {
    expect(safeEqual('s3cr3t-abc', 's3cr3t-abc')).toBe(true)
  })

  it('distintos con la misma longitud → false', () => {
    expect(safeEqual('s3cr3t-abc', 's3cr3t-abd')).toBe(false)
  })

  it('distinta longitud → false', () => {
    expect(safeEqual('s3cr3t', 's3cr3t-abc')).toBe(false)
    expect(safeEqual('s3cr3t-abc', 's3cr3t')).toBe(false)
  })

  it('null / undefined / vacío → false', () => {
    expect(safeEqual(null, 'x')).toBe(false)
    expect(safeEqual('x', null)).toBe(false)
    expect(safeEqual(undefined, 'x')).toBe(false)
    expect(safeEqual('x', undefined)).toBe(false)
    expect(safeEqual('', 'x')).toBe(false)
    expect(safeEqual('x', '')).toBe(false)
    expect(safeEqual('', '')).toBe(false)
    expect(safeEqual(null, null)).toBe(false)
  })

  it('compara por bytes (utf8), no por longitud en chars', () => {
    expect(safeEqual('ñ', 'n')).toBe(false)
    expect(safeEqual('ñ', 'ñ')).toBe(true)
  })
})

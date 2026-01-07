import { prisma } from '@/lib/prisma'

export async function findOrCreateVendor(params: {
  nif?: string
  iban?: string
  normalizedText?: string
}) {
  const nif = params.nif?.toUpperCase()
  const iban = params.iban?.toUpperCase()

  if (nif) {
    const existing = await prisma.accountingVendor.findUnique({
      where: { nif },
    })
    if (existing) return existing
  }
  if (iban) {
    const existing = await prisma.accountingVendor.findUnique({
      where: { iban },
    })
    if (existing) return existing
  }

  // Keyword matching (best-effort)
  if (params.normalizedText) {
    const vendors = await prisma.accountingVendor.findMany({ take: 2000 })
    const hay = params.normalizedText
    const match = vendors.find((v) => {
      if (!v.keywords) return false
      const keywords = (v.keywords as any)?.keywords || v.keywords
      if (!Array.isArray(keywords)) return false
      return keywords.some((k: string) => hay.includes(String(k).toLowerCase()))
    })
    if (match) return match
  }

  // Create minimal vendor if we have a strong identifier
  if (nif || iban) {
    return prisma.accountingVendor.create({
      data: {
        name: nif ? `Proveedor ${nif}` : `Proveedor ${iban}`,
        nif: nif || null,
        iban: iban || null,
      },
    })
  }

  return null
}

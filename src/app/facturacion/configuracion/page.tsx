'use client'

import { INVOICE_CONFIG } from '@/config/invoiceConfig'

export default function ConfiguracionPage() {
  return (
    <div className="space-y-4">
      <div className="bg-white border border-gray-200 rounded-lg p-4">
        <h2 className="text-base font-semibold text-gray-900 mb-1">
          Configuración de facturación
        </h2>
        <p className="text-sm text-gray-600">
          Datos del vendedor y textos legales que aparecen en los PDFs. Hoy
          estos valores viven en{' '}
          <code className="bg-gray-100 px-1 rounded text-xs">
            src/config/invoiceConfig.ts
          </code>{' '}
          — para cambiarlos hace falta editar el archivo y redesployar. Una
          futura versión moverá esto a una tabla en DB para que el admin pueda
          editarlo desde la UI.
        </p>
      </div>

      <Section title="Datos del vendedor">
        <Row label="Razón social" value={INVOICE_CONFIG.vendor.legalName || '—'} />
        <Row
          label="CIF"
          value={INVOICE_CONFIG.vendor.cif || '(no configurado)'}
          warning={!INVOICE_CONFIG.vendor.cif}
        />
        <Row
          label="Dirección"
          value={
            [
              INVOICE_CONFIG.vendor.address,
              INVOICE_CONFIG.vendor.postalCode,
              INVOICE_CONFIG.vendor.city,
              INVOICE_CONFIG.vendor.province,
            ]
              .filter(Boolean)
              .join(', ') || '(no configurada)'
          }
          warning={!INVOICE_CONFIG.vendor.address}
        />
        <Row label="País" value={INVOICE_CONFIG.vendor.country} />
        <Row label="Teléfono" value={INVOICE_CONFIG.vendor.phone || '—'} />
        <Row label="Email" value={INVOICE_CONFIG.vendor.email || '—'} />
      </Section>

      <Section title="REBU">
        <Row
          label="Texto legal en PDF"
          value={INVOICE_CONFIG.rebu.legalNote}
        />
        <p className="text-xs text-gray-500 mt-3">
          Este texto se imprime al pie de cada factura REBU. Si tu gestor pide
          una redacción más formal (ej: cita explícita del Art. 135 Ley 37/1992),
          edita <code>rebu.legalNote</code> en{' '}
          <code>src/config/invoiceConfig.ts</code>.
        </p>
      </Section>

      <Section title="IVA">
        <Row
          label="Tipo estándar"
          value={`${INVOICE_CONFIG.vat.standardRate} %`}
        />
      </Section>

      <Section title="Numeración">
        <Row
          label="Formato por defecto"
          value={INVOICE_CONFIG.formatting.defaultNumberFormat}
        />
        <p className="text-xs text-gray-500 mt-3">
          Cada serie en{' '}
          <a href="/facturacion/series" className="text-primary-700 hover:underline">
            Series y numeración
          </a>{' '}
          puede usar su propio formato (REBU usa <code>%03d</code>, IVA usa{' '}
          <code>%04d</code>). Este valor solo aplica a series nuevas que no
          definan uno explícito.
        </p>
      </Section>

      <Section title="Storage">
        <Row label="Prefijo Vercel Blob" value={INVOICE_CONFIG.storage.blobPrefix} />
        <p className="text-xs text-gray-500 mt-3">
          Los PDFs se guardan como{' '}
          <code>
            {INVOICE_CONFIG.storage.blobPrefix}
            &lt;FULL_INVOICE_NUMBER&gt;.pdf
          </code>{' '}
          en Vercel Blob, con acceso público. La URL queda guardada en{' '}
          <code>invoices.pdf_url</code>.
        </p>
      </Section>
    </div>
  )
}

function Section({
  title,
  children,
}: {
  title: string
  children: React.ReactNode
}) {
  return (
    <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
      <div className="px-4 py-2 bg-gray-50 border-b border-gray-200">
        <h3 className="text-sm font-semibold text-gray-900">{title}</h3>
      </div>
      <div className="p-4">{children}</div>
    </div>
  )
}

function Row({
  label,
  value,
  warning,
}: {
  label: string
  value: string
  warning?: boolean
}) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between py-2 border-b border-gray-100 last:border-0">
      <span className="text-xs font-medium text-gray-500 sm:w-1/3">{label}</span>
      <span
        className={`text-sm sm:w-2/3 ${
          warning ? 'text-amber-700' : 'text-gray-900'
        }`}
      >
        {value}
      </span>
    </div>
  )
}

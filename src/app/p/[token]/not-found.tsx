import Image from 'next/image'

export default function PresupuestoNoDisponible() {
  return (
    <main className="min-h-screen bg-slate-50 flex items-center justify-center px-4">
      <div className="max-w-md w-full bg-white rounded-2xl shadow-sm border border-slate-200 p-6 text-center">
        <Image
          src="/logocontrato.png"
          alt="Seven Cars"
          width={160}
          height={64}
          className="mx-auto mb-4 h-16 w-auto"
          priority
        />
        <h1 className="text-lg font-semibold text-gray-900">
          Presupuesto no disponible
        </h1>
        <p className="mt-2 text-sm text-slate-600">
          El enlace no es válido o el presupuesto ya no está activo. Si lo
          necesitas, pídenos uno nuevo.
        </p>
        <a
          href="https://www.sevencars.es"
          className="mt-5 inline-block px-4 py-2 rounded-lg bg-primary-600 text-white text-sm font-medium hover:bg-primary-700"
        >
          Ir a sevencars.es
        </a>
      </div>
    </main>
  )
}

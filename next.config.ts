import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  // El type-check sigue activo en build; el lint se corre aparte y no bloquea
  // el deploy (hay deuda preexistente de `no-explicit-any` por limpiar).
  eslint: {
    ignoreDuringBuilds: true,
  },

  // Optimizaciones de performance
  experimental: {
    optimizePackageImports: ['@heroicons/react'],
  },

  // Configuración de compilación
  compiler: {
    removeConsole: process.env.NODE_ENV === 'production',
  },

  // Configuración de headers para cache.
  // La API sirve datos autenticados y mutables: sin caché en navegador ni CDN
  // (con max-age la ficha seguía mostrando "sin factura" tras emitirla).
  async headers() {
    return [
      {
        source: '/api/:path*',
        headers: [
          {
            key: 'Cache-Control',
            value: 'private, no-store',
          },
        ],
      },
      {
        source: '/_next/static/:path*',
        headers: [
          {
            key: 'Cache-Control',
            value: 'public, max-age=31536000, immutable',
          },
        ],
      },
    ]
  },

  // Configuración de rewrites para API
  async rewrites() {
    return [
      {
        source: '/api/vehiculos',
        destination: '/api/vehiculos-optimized',
      },
    ]
  },

  // Configuración de output para Docker
  output: 'standalone',
}

export default nextConfig

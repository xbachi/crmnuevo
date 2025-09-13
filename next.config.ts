import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Optimizaciones de performance
  experimental: {
    optimizePackageImports: ['@heroicons/react'],
  },
  
  // Configuración de imágenes optimizadas
  images: {
    formats: ['image/webp', 'image/avif'],
    deviceSizes: [640, 750, 828, 1080, 1200, 1920, 2048, 3840],
    imageSizes: [16, 32, 48, 64, 96, 128, 256, 384],
  },
  
  // Configuración de compilación
  compiler: {
    removeConsole: process.env.NODE_ENV === 'production',
  },
  
  // Configuración de headers para cache
  async headers() {
    return [
      {
        source: '/api/:path*',
        headers: [
          {
            key: 'Cache-Control',
            value: 'public, max-age=60, s-maxage=60',
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
};

export default nextConfig;

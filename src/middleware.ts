import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

export function middleware(request: NextRequest) {
  const path = request.nextUrl.pathname

  if (!path.startsWith('/api/test-')) {
    return NextResponse.next()
  }

  if (process.env.NODE_ENV === 'production') {
    return new NextResponse(null, { status: 404 })
  }

  return NextResponse.next()
}

export const config = {
  matcher: '/api/:path*',
}

import { NextResponse } from 'next/server'
import { INVERSOR_COOKIE } from '@/lib/auth-edge'

export async function POST() {
  const res = NextResponse.json({ ok: true })
  res.cookies.set(INVERSOR_COOKIE, '', { path: '/', maxAge: 0 })
  return res
}

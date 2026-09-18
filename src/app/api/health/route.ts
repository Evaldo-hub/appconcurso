import { NextResponse } from 'next/server'
import { getPublicSupabaseEnv } from '@/lib/env'

export const dynamic = 'force-dynamic'

export async function GET() {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 5000)

  try {
    const { url, anonKey } = getPublicSupabaseEnv()
    const response = await fetch(`${url}/auth/v1/health`, {
      headers: { apikey: anonKey },
      cache: 'no-store',
      signal: controller.signal,
    })

    const healthy = response.ok
    return NextResponse.json(
      { status: healthy ? 'ok' : 'degraded', checkedAt: new Date().toISOString() },
      {
        status: healthy ? 200 : 503,
        headers: { 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex' },
      },
    )
  } catch {
    return NextResponse.json(
      { status: 'degraded', checkedAt: new Date().toISOString() },
      { status: 503, headers: { 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex' } },
    )
  } finally {
    clearTimeout(timeout)
  }
}

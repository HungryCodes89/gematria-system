import { NextResponse } from 'next/server'
import { getYesterdayET } from '@/lib/date-utils'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

// Vercel cron: daily at 11 AM ET (after both auto-settle passes at 7 AM and 10 AM)
export async function GET() {
  const date = getYesterdayET()

  const base = process.env.VERCEL_URL
    ? `https://${process.env.VERCEL_URL}`
    : 'http://localhost:3000'

  const res = await fetch(`${base}/api/reflection?date=${date}`, { method: 'POST' })

  if (!res.ok) {
    const text = await res.text()
    return NextResponse.json({ error: `Reflection POST failed: ${text}` }, { status: 500 })
  }

  const data = await res.json()
  return NextResponse.json({ success: true, date, ...data })
}

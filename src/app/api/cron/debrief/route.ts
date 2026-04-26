import { NextResponse } from 'next/server'
import { getYesterdayET } from '@/lib/date-utils'

export const dynamic = 'force-dynamic'
export const maxDuration = 120

// Vercel cron: daily at 12:00 UTC (after auto-settle at 7/10 UTC and reflection at 11 UTC)
export async function GET() {
  const date = getYesterdayET()

  const base = process.env.VERCEL_URL
    ? `https://${process.env.VERCEL_URL}`
    : 'http://localhost:3000'

  const res = await fetch(`${base}/api/debrief`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ date }),
  })

  if (!res.ok) {
    const text = await res.text()
    return NextResponse.json({ error: `Debrief POST failed: ${text}` }, { status: 500 })
  }

  const data = await res.json()
  return NextResponse.json({ success: true, date, signalUpdates: data.signalUpdates, selfHealApplied: data.selfHealApplied })
}

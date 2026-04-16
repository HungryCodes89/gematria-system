import { NextRequest, NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

// Runs at 2:00 AM ET (06:00 UTC / EDT) — all games finished by this point.
// Delegates to the main settle route which handles scores + CLV + bankroll.
export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization')
  if (process.env.CRON_SECRET && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Import and call POST directly to avoid an internal HTTP round-trip
  const { POST } = await import('@/app/api/settle/route')
  const result = await POST()
  const data = await result.json()

  console.log('[auto-settle cron]', JSON.stringify(data))
  return NextResponse.json(data)
}

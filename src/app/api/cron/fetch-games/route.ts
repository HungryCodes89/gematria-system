import { NextRequest, NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

// Runs at 10:30 AM ET (14:30 UTC) daily — fetches today's NBA/NHL/MLB slate.
export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization')
  if (process.env.CRON_SECRET && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { POST } = await import('@/app/api/fetch-games/route')
  const result = await POST()
  const data = await result.json()

  console.log('[fetch-games cron]', JSON.stringify(data))
  return NextResponse.json(data)
}

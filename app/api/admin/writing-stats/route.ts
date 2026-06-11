import { NextRequest } from 'next/server'
import { getAppCloudflareContext } from '@/lib/cloudflare'
import {
  ensureAuthenticatedRequest,
  jsonError,
  AppError,
} from '@/lib/server/route-helpers'
import { NextResponse } from 'next/server'
import { getWeeklyWritingStats, getShameMessages } from '@/lib/writing-shamer'

export const GET = async (req: NextRequest) => {
  try {
    const cf = await getAppCloudflareContext()
    const env = cf.env
    const db = env?.DB as D1Database | undefined

    if (!db) {
      return NextResponse.json({ stats: null, messages: [] })
    }

    const authError = await ensureAuthenticatedRequest(req, db)
    if (authError) {
      return NextResponse.json({ stats: null, messages: [] })
    }

    const stats = await getWeeklyWritingStats(db)
    const messages = getShameMessages(stats)

    return NextResponse.json({ stats, messages })
  } catch {
    return NextResponse.json({ stats: null, messages: [] })
  }
}

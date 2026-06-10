import type { NextRequest } from 'next/server'
import { syncAihotDaily } from '@/lib/aihot-daily'
import { ensureAuthenticatedRequest, getRouteEnvWithDb, jsonError, jsonOk } from '@/lib/server/route-helpers'

export async function POST(req: NextRequest) {
  const route = await getRouteEnvWithDb('AI 日报数据库未就绪')
  if (!route.ok) return route.response

  const unauthorized = await ensureAuthenticatedRequest(req, route.db)
  if (unauthorized) return unauthorized

  try {
    const result = await syncAihotDaily(route.db)

    return jsonOk({
      success: true,
      fetchedAt: result.fetchedAt,
      date: result.payload.date,
    })
  } catch (error) {
    console.error('[AIHOT_DAILY_SYNC_FAILED]', error)
    return jsonError(error instanceof Error ? error.message : '同步 AI 日报失败', 500)
  }
}

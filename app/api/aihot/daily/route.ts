import { getLatestAihotDaily } from '@/lib/aihot-daily'
import { getRouteEnvWithDb, jsonError, jsonOk } from '@/lib/server/route-helpers'

export const revalidate = 0

export async function GET() {
  const route = await getRouteEnvWithDb('AI 日报数据库未就绪')
  if (!route.ok) return route.response

  try {
    const daily = await getLatestAihotDaily(route.db)
    if (!daily) {
      return jsonOk({
        daily: null,
        status: 'empty',
      })
    }

    return jsonOk({
      daily,
      status: 'ready',
    })
  } catch (error) {
    console.error('[AIHOT_DAILY_GET_FAILED]', error)
    return jsonError(error instanceof Error ? error.message : '读取 AI 日报失败', 500)
  }
}

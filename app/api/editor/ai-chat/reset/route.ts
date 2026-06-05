import { resetAiArticleThread } from '@/lib/repositories/ai-article-threads'
import {
  ensureAuthenticatedRequest,
  getRouteEnvWithDb,
  jsonError,
  jsonOk,
  parseJsonBody,
} from '@/lib/server/route-helpers'
import type { NextRequest } from 'next/server'

export async function POST(req: NextRequest) {
  const route = await getRouteEnvWithDb('DB unavailable')
  if (!route.ok) return route.response

  const authError = await ensureAuthenticatedRequest(req, route.db)
  if (authError) return authError

  const body = await parseJsonBody<{ articleKey?: string; postSlug?: string }>(req)
  if (!(body.articleKey || body.postSlug)) {
    return jsonError('缺少文章标识', 400)
  }

  await resetAiArticleThread(route.db, {
    articleKey: body.articleKey,
    postSlug: body.postSlug,
  })

  return jsonOk({ success: true })
}

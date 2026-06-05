import { getOrCreateAiArticleThread, listAiArticleMessages } from '@/lib/repositories/ai-article-threads'
import {
  ensureAuthenticatedRequest,
  getRouteEnvWithDb,
  jsonError,
  jsonOk,
} from '@/lib/server/route-helpers'
import type { NextRequest } from 'next/server'

export async function GET(req: NextRequest) {
  const route = await getRouteEnvWithDb('DB unavailable')
  if (!route.ok) return route.response

  const authError = await ensureAuthenticatedRequest(req, route.db)
  if (authError) return authError

  const articleKey = req.nextUrl.searchParams.get('articleKey')
  const postSlug = req.nextUrl.searchParams.get('postSlug')
  const title = req.nextUrl.searchParams.get('title')

  if (!(articleKey || postSlug)) {
    return jsonError('缺少文章标识', 400)
  }

  const thread = await getOrCreateAiArticleThread(route.db, {
    articleKey,
    postSlug,
    title,
  })
  const messages = await listAiArticleMessages(route.db, thread.id, 100)

  return jsonOk({
    thread,
    messages,
  })
}

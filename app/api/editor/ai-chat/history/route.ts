import { getOrCreateWorkspaceThread, listAiArticleMessages } from '@/lib/repositories/ai-article-threads'
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

  const workspaceThread = await getOrCreateWorkspaceThread(route.db)
  const messages = await listAiArticleMessages(route.db, workspaceThread.id, 100)

  return jsonOk({
    thread: workspaceThread,
    messages,
  })
}

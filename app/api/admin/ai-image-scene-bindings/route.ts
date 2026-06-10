import { NextRequest, NextResponse } from 'next/server'
import { authenticateRequest } from '@/lib/admin-auth'
import { getAppCloudflareEnv } from '@/lib/cloudflare'
import { listAiImageSceneBindings, saveAiImageSceneBindings } from '@/lib/ai-image/scenes'
import { ensureAiImageConfigInfrastructure } from '@/lib/ai-image/config'

export async function GET(req: NextRequest) {
  const env = await getAppCloudflareEnv()
  const db = env?.DB as D1Database | undefined
  if (!(await authenticateRequest(req, db))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  if (!db) return NextResponse.json({ error: 'DB unavailable' }, { status: 500 })

  await ensureAiImageConfigInfrastructure(db)
  const rows = await listAiImageSceneBindings(db)

  return NextResponse.json({
    bindings: Object.fromEntries(rows.map((row) => [row.scene_key, row.action_key])),
  })
}

export async function PUT(req: NextRequest) {
  const env = await getAppCloudflareEnv()
  const db = env?.DB as D1Database | undefined
  if (!(await authenticateRequest(req, db))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  if (!db) return NextResponse.json({ error: 'DB unavailable' }, { status: 500 })

  let body: { bindings?: Record<string, string> }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: '请求体不是有效 JSON' }, { status: 400 })
  }

  const bindings = body.bindings
  if (!bindings || typeof bindings !== 'object') {
    return NextResponse.json({ error: '缺少有效的 bindings' }, { status: 400 })
  }

  await saveAiImageSceneBindings(db, bindings)
  const rows = await listAiImageSceneBindings(db)

  return NextResponse.json({
    success: true,
    bindings: Object.fromEntries(rows.map((row) => [row.scene_key, row.action_key])),
  })
}

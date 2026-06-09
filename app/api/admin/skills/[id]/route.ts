import { NextRequest, NextResponse } from 'next/server'
import { getAppCloudflareEnv } from '@/lib/cloudflare'
import { ensureAuthenticatedRequest, AppError, withRouteErrorHandling } from '@/lib/server/route-helpers'
import { ensureSkillsTable, getSkillRow, type SkillBucket } from '@/lib/skills/repository'

type RouteContext = {
  params: Promise<{ id: string }>
}

async function resolveId(ctx: RouteContext) {
  const id = Number((await ctx.params).id)
  if (!Number.isInteger(id) || id < 1) throw AppError.badRequest('无效的 Skill ID')
  return id
}

export const PUT = withRouteErrorHandling(async (req: NextRequest, rawCtx: unknown) => {
  const ctx = rawCtx as RouteContext
  const env = await getAppCloudflareEnv()
  const db = env?.DB as D1Database | undefined
  const authError = await ensureAuthenticatedRequest(req, db)
  if (authError) return authError
  if (!db) throw AppError.dbUnavailable()

  const id = await resolveId(ctx)
  const body = await req.json() as { enabled?: boolean }
  if (typeof body.enabled !== 'boolean') throw AppError.badRequest('缺少 enabled')

  await ensureSkillsTable(db)
  const row = await getSkillRow(db, id)
  if (!row) throw AppError.notFound('Skill 不存在')
  await db.prepare(`
    UPDATE skills
    SET is_enabled = ?, updated_at = strftime('%s', 'now')
    WHERE id = ?
  `).bind(body.enabled ? 1 : 0, id).run()

  return NextResponse.json({ success: true })
})

export const DELETE = withRouteErrorHandling(async (req: NextRequest, rawCtx: unknown) => {
  const ctx = rawCtx as RouteContext
  const env = await getAppCloudflareEnv()
  const db = env?.DB as D1Database | undefined
  const bucket = env?.SKILLS as unknown as SkillBucket | undefined
  const authError = await ensureAuthenticatedRequest(req, db)
  if (authError) return authError
  if (!db) throw AppError.dbUnavailable()
  if (!bucket) throw new AppError({ message: 'Skill R2 存储未配置', code: 'SKILLS_R2_UNAVAILABLE', status: 500 })

  const id = await resolveId(ctx)
  const row = await getSkillRow(db, id)
  if (!row) throw AppError.notFound('Skill 不存在')

  let manifest: Array<{ path?: string }> = []
  try {
    manifest = JSON.parse(row.file_manifest_json) as Array<{ path?: string }>
  } catch {
    manifest = []
  }
  const storageRoot = row.archive_key.slice(0, -'/package.zip'.length)
  const keys = [
    row.archive_key,
    row.skill_md_key,
    ...manifest.flatMap((item) => item.path ? [`${storageRoot}/files/${item.path}`] : []),
  ]

  await bucket.delete(keys)
  await db.prepare('DELETE FROM skills WHERE id = ?').bind(id).run()
  return NextResponse.json({ success: true })
})

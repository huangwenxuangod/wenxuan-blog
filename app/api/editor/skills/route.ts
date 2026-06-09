import { NextRequest, NextResponse } from 'next/server'
import { getAppCloudflareEnv } from '@/lib/cloudflare'
import { ensureAuthenticatedRequest, AppError, withRouteErrorHandling } from '@/lib/server/route-helpers'
import { listSkills } from '@/lib/skills/repository'

export const GET = withRouteErrorHandling(async (req: NextRequest) => {
  const env = await getAppCloudflareEnv()
  const db = env?.DB as D1Database | undefined
  const authError = await ensureAuthenticatedRequest(req, db)
  if (authError) return authError
  if (!db) throw AppError.dbUnavailable()

  return NextResponse.json({ skills: await listSkills(db, true) })
})

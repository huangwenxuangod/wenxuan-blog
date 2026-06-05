import { NextRequest, NextResponse } from 'next/server'
import { getAppCloudflareEnv } from '@/lib/cloudflare'
import { AppError, withRouteErrorHandling } from '@/lib/server/route-helpers'

export const GET = withRouteErrorHandling(async (req: NextRequest) => {
  const query = req.nextUrl.searchParams.get('q')

  if (!query || !query.trim()) {
    return NextResponse.json({ results: [] })
  }

  const env = await getAppCloudflareEnv()

  if (!env?.DB) {
    throw AppError.dbUnavailable()
  }

  const { searchPostsWithStrategy } = await import('@/lib/related-content/search')
  const result = await searchPostsWithStrategy(env.DB, env, query.trim(), { limit: 50 })

  return NextResponse.json({
    strategy: result.strategy,
    source: result.source,
    results: result.results.map((p) => ({
      slug: p.slug,
      title: p.title,
      description: p.description,
      category: p.category,
      published_at: p.published_at,
      password: !!p.password,
    })),
  })
})

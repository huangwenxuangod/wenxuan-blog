import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'
import { authenticateRequest } from '@/lib/admin-auth'
import { getAppCloudflareEnv } from '@/lib/cloudflare'
import { getPosts } from '@/lib/db'

export async function GET(req: NextRequest) {
  const env = await getAppCloudflareEnv()
  const db = env?.DB as D1Database | undefined

  if (!(await authenticateRequest(req, db))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  if (!db) {
    return NextResponse.json({ error: 'DB unavailable' }, { status: 500 })
  }

  const posts = await getPosts(db, 200, 0, true, true, true, true)

  return NextResponse.json({
    posts: posts.map((post) => ({
      slug: post.slug,
      title: post.title || '未命名文章',
    })),
  })
}

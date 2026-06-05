import type { NextRequest } from 'next/server'
import { ensureAuthenticatedRequest, getRouteContextWithDb, jsonError, jsonOk, parseJsonBody } from '@/lib/server/route-helpers'
import { getPostBySlug, restorePost, updatePostBySlug } from '@/lib/db'
import { invalidatePublicContentCache } from '@/lib/cache'

type BulkAction =
  | 'set-category'
  | 'set-status'
  | 'set-pinned'
  | 'set-hidden'
  | 'delete'
  | 'restore'
  | 'clear-password'

interface BulkPayload {
  slugs: string[]
  action: BulkAction
  value?: string | number | null
}

export async function POST(req: NextRequest) {
  const route = await getRouteContextWithDb('DB not configured')
  if (!route.ok) return route.response

  const authError = await ensureAuthenticatedRequest(req, route.db)
  if (authError) return authError

  const { env, db, ctx } = route

  try {
    const { slugs, action, value } = await parseJsonBody<BulkPayload>(req)

    const uniqueSlugs = Array.from(new Set((slugs || []).map((slug) => slug.trim()).filter(Boolean)))
    if (uniqueSlugs.length === 0) return jsonError('请先选择文章', 400)

    const touchedPostIds: number[] = []
    let affected = 0

    for (const slug of uniqueSlugs) {
      const post = await getPostBySlug(db, slug)
      if (!post) continue

      switch (action) {
        case 'set-category':
          await updatePostBySlug(db, slug, { category: typeof value === 'string' ? value : '未分类' })
          break
        case 'set-status':
          if (value !== 'draft' && value !== 'published') {
            return jsonError('无效状态', 400)
          }
          await updatePostBySlug(db, slug, { status: value })
          break
        case 'set-pinned':
          if (value !== 0 && value !== 1) return jsonError('无效置顶值', 400)
          await updatePostBySlug(db, slug, { is_pinned: value })
          break
        case 'set-hidden':
          if (value !== 0 && value !== 1) return jsonError('无效隐藏值', 400)
          await updatePostBySlug(db, slug, { is_hidden: value })
          break
        case 'delete':
          await updatePostBySlug(db, slug, { status: 'deleted' })
          break
        case 'restore':
          await restorePost(db, slug)
          break
        case 'clear-password':
          await updatePostBySlug(db, slug, { password: null })
          break
        default:
          return jsonError('不支持的批量操作', 400)
      }

      touchedPostIds.push(post.id)
      affected += 1
    }

    try {
      await invalidatePublicContentCache(env)
    } catch (cacheErr) {
      console.warn('Bulk cache invalidation failed:', cacheErr)
    }

    const { enqueueBackgroundJob } = await import('@/lib/background-jobs/enqueue')

    for (const postId of touchedPostIds) {
      await enqueueBackgroundJob(
        env,
        {
          type: action === 'delete' ? 'delete-post-related-index' : 'sync-post-related-index',
          postId,
        },
        {
          waitUntil: ctx?.waitUntil?.bind(ctx),
        },
      )
    }

    return jsonOk({ success: true, affected })
  } catch (error) {
    console.error('POST /api/admin/posts/bulk error:', error)
    return jsonError(error instanceof Error ? error.message : '批量操作失败', 500)
  }
}

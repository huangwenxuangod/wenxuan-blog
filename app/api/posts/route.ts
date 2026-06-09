import { createPost, updatePostBySlug } from '@/lib/db'
import { invalidatePublicContentCache } from '@/lib/cache'
import { nanoid } from 'nanoid'
import { buildAutoDescription, normalizePostSlug } from '@/lib/post-utils'
import {
  ensureAuthenticatedRequest,
  getRouteContextWithDb,
  jsonOk,
  parseJsonBody,
} from '@/lib/server/route-helpers'
import type { NextRequest } from 'next/server'
import {
  createRequestId,
  logServerEvent,
  serverErrorResponse,
  withRequestId,
} from '@/lib/server/observability'

export async function POST(req: NextRequest) {
  const requestId = createRequestId(req)
  const routeName = '/api/posts'
  try {
    const route = await getRouteContextWithDb('数据库未配置')
    if (!route.ok) return withRequestId(route.response, requestId)
    const { env, db, ctx } = route

    // 2. 统一认证：Cookie OR Bearer Token
    const authError = await ensureAuthenticatedRequest(req, db)
    if (authError) {
      logServerEvent('warn', 'POST_CREATE_UNAUTHORIZED', {
        requestId,
        route: routeName,
        method: 'POST',
      })
      return withRequestId(authError, requestId)
    }

    const payload = await parseJsonBody<Record<string, unknown>>(req)
    const title = typeof payload.title === 'string' ? payload.title.trim() : ''
    const content = typeof payload.content === 'string' ? payload.content.trim() : ''
    const rawHtml = typeof payload.html === 'string' ? payload.html.trim() : ''
    const payloadCategory = typeof payload.category === 'string' ? payload.category.trim() : ''
    const customSlug = typeof payload.slug === 'string' ? normalizePostSlug(payload.slug) : ''
    const status = payload.status === 'draft' ? 'draft' : 'published'
    const password = typeof payload.password === 'string' && payload.password.trim() ? payload.password.trim() : null
    const is_hidden = payload.is_hidden === 1 ? 1 : 0
    const description = typeof payload.description === 'string' && payload.description.trim()
      ? payload.description.trim()
      : buildAutoDescription(content)
    const tags = Array.isArray(payload.tags)
      ? (payload.tags as unknown[])
        .filter((tag): tag is string => typeof tag === 'string')
        .map((tag) => tag.trim())
        .filter(Boolean)
        .slice(0, 10)
      : []
    const coverImage = typeof payload.cover_image === 'string' && payload.cover_image.trim()
      ? payload.cover_image.trim()
      : null

    if (!title || !content) {
      return serverErrorResponse({
        requestId,
        route: routeName,
        method: 'POST',
        code: 'POST_VALIDATION_FAILED',
        message: '标题和内容不能为空',
        status: 400,
      })
    }

    logServerEvent('info', 'POST_CREATE_STARTED', {
      requestId,
      route: routeName,
      method: 'POST',
      context: {
        titleLength: title.length,
        contentLength: content.length,
        category: payloadCategory || 'AI',
        status,
      },
    })

    // 2. 生成 slug（日期 + 随机）
    const date = new Date().toISOString().split('T')[0]
    const slug = customSlug || `${date}-${nanoid(6)}`

    // 3. 优先使用编辑器直接生成的 HTML，兼容旧版 Markdown 提交
    const { remark } = await import('remark')
    const { default: remarkGfm } = await import('remark-gfm')
    const { default: remarkHtml } = await import('remark-html')
    const htmlContent =
      rawHtml ||
      (
        await remark()
          .use(remarkGfm)
          .use(remarkHtml, { sanitize: false })
          .process(content)
      ).toString()

    // 4. 立即保存到 D1（不等 AI）
    const postId = await createPost(db, {
      slug,
      title,
      content,
      html: htmlContent,
      description,
      category: payloadCategory || 'AI',
      tags,
      status,
      password,
      is_hidden,
      cover_image: coverImage,
    })

    // 6. 清除缓存
    await invalidatePublicContentCache(env)

    const { enqueueBackgroundJob } = await import('@/lib/background-jobs/enqueue')

    await enqueueBackgroundJob(
      env,
      {
        type: 'process-post-ai',
        postId,
      },
      {
        waitUntil: ctx?.waitUntil?.bind(ctx),
      },
    )

    await enqueueBackgroundJob(
      env,
      {
        type: 'sync-post-related-index',
        postId,
      },
      {
        waitUntil: ctx?.waitUntil?.bind(ctx),
      },
    )

    logServerEvent('info', 'POST_CREATE_SUCCEEDED', {
      requestId,
      route: routeName,
      method: 'POST',
      context: { postId, slug, status },
    })
    return withRequestId(jsonOk({
      success: true,
      slug,
      id: postId,
      category: payloadCategory || 'AI',
      tags,
      description,
      cover_image: coverImage,
    }), requestId)
  } catch (error) {
    if (error instanceof Error && /UNIQUE constraint failed: posts\.slug/i.test(error.message)) {
      return serverErrorResponse({
        requestId,
        route: routeName,
        method: 'POST',
        code: 'POST_SLUG_CONFLICT',
        message: 'slug 已存在，请换一个',
        status: 409,
        error,
      })
    }
    return serverErrorResponse({
      requestId,
      route: routeName,
      method: 'POST',
      code: 'POST_CREATE_FAILED',
      message: '文章保存失败',
      hint: '请使用 requestId 在 Cloudflare Worker 日志中搜索具体错误。',
      details: error instanceof Error ? error.message : String(error),
      error,
    })
  }
}

// PATCH: 自动保存（只更新变化的字段）
export async function PATCH(req: NextRequest) {
  const requestId = createRequestId(req)
  const routeName = '/api/posts'
  try {
    const route = await getRouteContextWithDb('数据库未配置')
    if (!route.ok) return withRequestId(route.response, requestId)
    const { env, db } = route

    const authError = await ensureAuthenticatedRequest(req, db)
    if (authError) return withRequestId(authError, requestId)

    const payload = await parseJsonBody<Record<string, unknown>>(req)
    const currentSlug = typeof payload.current_slug === 'string'
      ? payload.current_slug.trim()
      : (typeof payload.slug === 'string' ? payload.slug.trim() : '')
    const nextSlug = typeof payload.new_slug === 'string'
      ? normalizePostSlug(payload.new_slug)
      : ''

    if (!currentSlug) {
      return serverErrorResponse({
        requestId,
        route: routeName,
        method: 'PATCH',
        code: 'POST_SLUG_REQUIRED',
        message: 'slug 不能为空',
        status: 400,
      })
    }

    // 构建更新对象（只包含提供的字段）
    const updates: Record<string, unknown> = {}
    if (nextSlug && nextSlug !== currentSlug) updates.slug = nextSlug
    if (payload.title !== undefined) updates.title = payload.title
    if (payload.content !== undefined) updates.content = payload.content
    if (payload.html !== undefined) updates.html = payload.html
    if (payload.description !== undefined) {
      const rawDescription = typeof payload.description === 'string' ? payload.description.trim() : ''
      const rawContent = typeof payload.content === 'string' ? payload.content : ''
      updates.description = rawDescription || buildAutoDescription(rawContent)
    }
    if (payload.category !== undefined) updates.category = payload.category
    if (payload.tags !== undefined) updates.tags = payload.tags
    if (payload.cover_image !== undefined) updates.cover_image = payload.cover_image
    if (payload.status === 'draft' || payload.status === 'published' || payload.status === 'deleted') {
      updates.status = payload.status
    }

    if (Object.keys(updates).length === 0) {
      return withRequestId(jsonOk({ success: true, slug: currentSlug }), requestId)
    }

    await updatePostBySlug(db, currentSlug, updates)

    // 清除缓存
    await invalidatePublicContentCache(env)

    return withRequestId(jsonOk({ success: true, slug: nextSlug || currentSlug }), requestId)
  } catch (error) {
    if (error instanceof Error && /UNIQUE constraint failed: posts\.slug/i.test(error.message)) {
      return serverErrorResponse({
        requestId,
        route: routeName,
        method: 'PATCH',
        code: 'POST_SLUG_CONFLICT',
        message: 'slug 已存在，请换一个',
        status: 409,
        error,
      })
    }
    return serverErrorResponse({
      requestId,
      route: routeName,
      method: 'PATCH',
      code: 'POST_UPDATE_FAILED',
      message: '自动保存失败',
      details: error instanceof Error ? error.message : String(error),
      error,
    })
  }
}

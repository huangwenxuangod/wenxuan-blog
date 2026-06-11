import { nanoid } from 'nanoid'
import { invalidatePublicContentCache } from '@/lib/cache'
import { createPost, getPostBySlug, getPosts, searchPosts, updatePostBySlug } from '@/lib/db'
import { normalizePostSlug } from '@/lib/post-utils'
import type {
  CreatePostToolPayload,
  GetPostToolPayload,
  ListPostsToolPayload,
  SearchPostsToolPayload,
  UpdatePostToolPayload,
} from '@/lib/ai-editor/tool-registry'

function buildExcerpt(content: string, maxLength = 180) {
  const normalized = String(content || '').replace(/\s+/g, ' ').trim()
  if (!normalized) return ''
  return normalized.length > maxLength
    ? `${normalized.slice(0, maxLength).trim()}...`
    : normalized
}

async function renderMarkdownToHtml(markdown: string) {
  const { remark } = await import('remark')
  const { default: remarkGfm } = await import('remark-gfm')
  const { default: remarkHtml } = await import('remark-html')

  return (
    await remark()
      .use(remarkGfm)
      .use(remarkHtml, { sanitize: false })
      .process(markdown)
  ).toString()
}

export async function executeListPostsTool(
  db: D1Database,
  payload: ListPostsToolPayload,
) {
  const limit = Math.min(Math.max(Number(payload.limit) || 12, 1), 50)
  const posts = await getPosts(
    db,
    200,
    0,
    true,
    payload.includeEncrypted ?? true,
    payload.includeHidden ?? true,
    true,
  )

  const filtered = posts
    .filter((post) => !payload.category || post.category === payload.category)
    .filter((post) => !payload.status || post.status === payload.status)
    .slice(0, limit)

  return {
    posts: filtered.map((post) => ({
      slug: post.slug,
      title: post.title || '未命名文章',
      category: post.category,
      status: post.status,
      updatedAt: post.updated_at,
    })),
  }
}

export async function executeSearchPostsTool(
  db: D1Database,
  payload: SearchPostsToolPayload,
) {
  const query = String(payload.query || '').trim()
  if (!query) {
    return { posts: [] }
  }

  const limit = Math.min(Math.max(Number(payload.limit) || 8, 1), 20)
  const results = await searchPosts(
    db,
    query,
    limit,
    payload.includeDrafts ?? true,
    payload.includeEncrypted ?? true,
    payload.includeHidden ?? true,
    payload.includeDeleted ?? true,
  )

  return {
    posts: results.map((post) => ({
      slug: post.slug,
      title: post.title || '未命名文章',
      category: post.category,
      description: post.description,
      excerpt: buildExcerpt(post.content),
    })),
  }
}

export async function executeGetPostTool(
  db: D1Database,
  payload: GetPostToolPayload,
) {
  const slug = String(payload.slug || '').trim()
  if (!slug) {
    throw new Error('get_post 缺少 slug')
  }

  const post = await getPostBySlug(db, slug)
  if (!post) {
    throw new Error(`文章不存在: ${slug}`)
  }

  return {
    post: {
      slug: post.slug,
      title: post.title,
      content: post.content,
      html: post.html,
      category: post.category,
      description: post.description,
      tags: post.tags,
      status: post.status,
      coverImage: post.cover_image,
    },
  }
}

export async function executeCreatePostTool(
  db: D1Database,
  env: CloudflareEnv | null | undefined,
  payload: CreatePostToolPayload,
) {
  const title = String(payload.title || '').trim()
  const content = String(payload.content || '').trim()
  if (!title || !content) {
    throw new Error('create_post 需要 title 和 content')
  }

  const customSlug = typeof payload.slug === 'string' ? normalizePostSlug(payload.slug) : ''
  const date = new Date().toISOString().split('T')[0]
  const slug = customSlug || `${date}-${nanoid(6)}`
  const html = await renderMarkdownToHtml(content)

  const postId = await createPost(db, {
    slug,
    title,
    content,
    html,
    description: typeof payload.description === 'string' ? payload.description.trim() : undefined,
    category: typeof payload.category === 'string' && payload.category.trim() ? payload.category.trim() : 'AI',
    tags: Array.isArray(payload.tags) ? payload.tags.filter((item) => typeof item === 'string').map((item) => item.trim()).filter(Boolean).slice(0, 10) : [],
    status: payload.status === 'published' ? 'published' : 'draft',
    cover_image: typeof payload.coverImage === 'string' ? payload.coverImage.trim() || null : null,
  })

  if (env) {
    await invalidatePublicContentCache(env)
    const { enqueueBackgroundJob } = await import('@/lib/background-jobs/enqueue')
    await enqueueBackgroundJob(env, {
      type: 'process-post-ai',
      postId,
    })
    await enqueueBackgroundJob(env, {
      type: 'sync-post-related-index',
      postId,
    })
  }

  return {
    success: true,
    id: postId,
    slug,
    title,
    category: typeof payload.category === 'string' && payload.category.trim() ? payload.category.trim() : 'AI',
    status: payload.status === 'published' ? 'published' : 'draft',
  }
}

export async function executeUpdatePostTool(
  db: D1Database,
  env: CloudflareEnv | null | undefined,
  payload: UpdatePostToolPayload,
) {
  const slug = String(payload.slug || '').trim()
  if (!slug) {
    throw new Error('update_post 缺少 slug')
  }

  const post = await getPostBySlug(db, slug)
  if (!post) {
    throw new Error(`文章不存在: ${slug}`)
  }

  const updates = payload.updates || {}
  const nextContent = typeof updates.content === 'string' ? updates.content.trim() : undefined
  const nextSlug = typeof updates.newSlug === 'string' ? normalizePostSlug(updates.newSlug) : undefined

  await updatePostBySlug(db, slug, {
    slug: nextSlug,
    title: typeof updates.title === 'string' ? updates.title.trim() : undefined,
    content: nextContent,
    html: nextContent !== undefined ? await renderMarkdownToHtml(nextContent) : undefined,
    category: typeof updates.category === 'string' ? updates.category.trim() : undefined,
    description: typeof updates.description === 'string' ? updates.description.trim() : undefined,
    tags: Array.isArray(updates.tags) ? updates.tags.filter((item) => typeof item === 'string').map((item) => item.trim()).filter(Boolean).slice(0, 10) : undefined,
    status: updates.status,
    cover_image: updates.coverImage !== undefined ? updates.coverImage : undefined,
  })

  if (env) {
    await invalidatePublicContentCache(env)
    const { enqueueBackgroundJob } = await import('@/lib/background-jobs/enqueue')
    await enqueueBackgroundJob(env, {
      type: 'sync-post-related-index',
      postId: post.id,
    })
  }

  return {
    success: true,
    slug: nextSlug || slug,
    title: typeof updates.title === 'string' && updates.title.trim() ? updates.title.trim() : post.title,
    changedFields: Object.keys(updates).filter((key) => key !== 'newSlug'),
  }
}

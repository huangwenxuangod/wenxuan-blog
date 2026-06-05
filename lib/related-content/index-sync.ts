import { buildPostVectorText, isVectorizeEnabled } from '@/lib/related-content/vector'
import {
  buildHashedEmbedding,
  parseTags,
  type PublicPostRow,
} from '@/lib/related-content/shared'

const VECTOR_NAMESPACE = 'posts'
const DEFAULT_VECTOR_DIMENSIONS = 128

async function getVectorDimensions(index: VectorizeIndex): Promise<number> {
  try {
    const description = await index.describe()
    const details = description as { dimensions?: number; config?: { dimensions?: number } } | undefined
    const config = description?.config as { dimensions?: number } | undefined
    const dimensions =
      config?.dimensions ||
      details?.dimensions ||
      DEFAULT_VECTOR_DIMENSIONS
    return Math.max(8, dimensions)
  } catch {
    return DEFAULT_VECTOR_DIMENSIONS
  }
}

async function getPostForIndexing(db: D1Database, postId: number): Promise<PublicPostRow | null> {
  return db
    .prepare(
      `SELECT id, slug, title, content, description, category, tags, status, password, is_hidden, deleted_at, published_at
       FROM posts
       WHERE id = ?`
    )
    .bind(postId)
    .first<PublicPostRow>()
}

function isIndexablePost(post: PublicPostRow | null): post is PublicPostRow {
  return Boolean(
    post &&
    post.status === 'published' &&
    !post.password &&
    post.is_hidden === 0 &&
    post.deleted_at == null
  )
}

export async function syncPostToRelatedIndex(
  env: Partial<CloudflareEnv> | null | undefined,
  postId: number,
): Promise<'synced' | 'skipped' | 'deleted'> {
  if (!isVectorizeEnabled(env) || !env.DB) return 'skipped'

  const post = await getPostForIndexing(env.DB, postId)
  if (!isIndexablePost(post)) {
    if (env.VECTOR_INDEX.deleteByIds) {
      await env.VECTOR_INDEX.deleteByIds([`post:${postId}`])
      return 'deleted'
    }
    return 'skipped'
  }

  const dimensions = await getVectorDimensions(env.VECTOR_INDEX)
  const values = buildHashedEmbedding(buildPostVectorText({
    title: post.title,
    description: post.description,
    category: post.category,
    tags: post.tags,
    content: post.content,
  }), dimensions)

  await env.VECTOR_INDEX.upsert([
    {
      id: `post:${post.id}`,
      namespace: VECTOR_NAMESPACE,
      values,
      metadata: {
        slug: post.slug,
        title: post.title,
        category: post.category || '',
        tags: parseTags(post.tags),
        published_at: post.published_at,
      },
    },
  ])

  return 'synced'
}

export async function deletePostFromRelatedIndex(
  env: Partial<CloudflareEnv> | null | undefined,
  postId: number,
): Promise<void> {
  if (!isVectorizeEnabled(env) || !env.VECTOR_INDEX.deleteByIds) return
  await env.VECTOR_INDEX.deleteByIds([`post:${postId}`])
}

import type { Post, PostWithTags } from '@/lib/repositories/types'
import {
  buildHashedEmbedding,
  buildPostVectorText,
  mapPost,
  readFlag,
} from '@/lib/related-content/shared'

const VECTOR_NAMESPACE = 'posts'
const DEFAULT_VECTOR_DIMENSIONS = 128

export function isVectorizeEnabled(env?: Partial<CloudflareEnv> | null): env is Partial<CloudflareEnv> & { VECTOR_INDEX: VectorizeIndex } {
  return Boolean(env?.VECTOR_INDEX) && readFlag(env?.ENABLE_VECTOR_SEARCH)
}

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

async function fetchPostsBySlugs(db: D1Database, slugs: string[]): Promise<PostWithTags[]> {
  if (slugs.length === 0) return []

  const placeholders = slugs.map(() => '?').join(', ')
  const { results } = await db
    .prepare(
      `SELECT * FROM posts
       WHERE slug IN (${placeholders})
         AND status = 'published'
         AND password IS NULL
         AND is_hidden = 0
         AND deleted_at IS NULL`
    )
    .bind(...slugs)
    .all<Post>()

  const order = new Map(slugs.map((slug, index) => [slug, index]))
  return results
    .map(mapPost)
    .sort((left, right) => (order.get(left.slug) ?? Number.MAX_SAFE_INTEGER) - (order.get(right.slug) ?? Number.MAX_SAFE_INTEGER))
}

export async function tryVectorLookup(
  db: D1Database,
  env: Partial<CloudflareEnv> | null | undefined,
  queryText: string,
  excludeSlug: string | null,
  limit: number,
): Promise<PostWithTags[] | null> {
  if (!isVectorizeEnabled(env)) return null

  try {
    const dimensions = await getVectorDimensions(env.VECTOR_INDEX)
    const vector = buildHashedEmbedding(queryText, dimensions)
    const response = await env.VECTOR_INDEX.query(vector, {
      topK: Math.max(limit + 6, 12),
      namespace: VECTOR_NAMESPACE,
      returnMetadata: 'all',
    }) as { matches?: Array<{ metadata?: Record<string, unknown> }> }

    const slugs = (response.matches || [])
      .map((match) => {
        const metadataSlug = match?.metadata?.slug
        return typeof metadataSlug === 'string' ? metadataSlug : null
      })
      .filter((slug): slug is string => Boolean(slug) && slug !== excludeSlug)

    if (slugs.length === 0) return []

    const uniqueSlugs = Array.from(new Set(slugs))
    const posts = await fetchPostsBySlugs(db, uniqueSlugs)
    return posts.slice(0, limit)
  } catch (error) {
    console.warn('Vector lookup failed, falling back to FTS/rules:', error)
    return null
  }
}

export { buildPostVectorText }

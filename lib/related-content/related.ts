import { searchPosts } from '@/lib/repositories/search'
import type { Post, PostWithTags } from '@/lib/repositories/types'
import {
  buildRelatedQuery,
  buildTokenSet,
  mapPost,
  scoreCandidate,
  type RelatedSearchResult,
} from '@/lib/related-content/shared'
import { buildPostVectorText, tryVectorLookup } from '@/lib/related-content/vector'

async function getRuleBasedRelatedPosts(db: D1Database, current: PostWithTags, limit: number): Promise<PostWithTags[]> {
  const query = buildRelatedQuery(current)
  const fromSearch = query ? await searchPosts(db, query, Math.max(limit * 4, 12)) : []
  const recentResult = await db
    .prepare(
      `SELECT * FROM posts
       WHERE slug != ?
         AND status = 'published'
         AND password IS NULL
         AND is_hidden = 0
         AND deleted_at IS NULL
       ORDER BY published_at DESC
       LIMIT ?`
    )
    .bind(current.slug, Math.max(limit * 12, 48))
    .all<Post>()

  const merged = new Map<string, PostWithTags>()
  for (const post of [...fromSearch, ...recentResult.results.map(mapPost)]) {
    if (post.slug === current.slug) continue
    merged.set(post.slug, post)
  }

  const currentTokens = buildTokenSet(current)
  const currentTags = new Set(current.tags)

  return Array.from(merged.values())
    .map((post) => ({
      post,
      score: scoreCandidate(post, current, currentTokens, currentTags),
    }))
    .filter((item) => item.score > 0)
    .sort((left, right) => right.score - left.score || right.post.published_at - left.post.published_at)
    .slice(0, limit)
    .map((item) => item.post)
}

export async function getRelatedPosts(
  db: D1Database,
  env: Partial<CloudflareEnv> | null | undefined,
  post: PostWithTags,
  limit = 3,
): Promise<RelatedSearchResult> {
  const vectorResults = await tryVectorLookup(db, env, buildPostVectorText(post), post.slug, limit)
  if (vectorResults && vectorResults.length > 0) {
    return {
      strategy: 'vectorize',
      source: 'vectorize',
      results: vectorResults,
    }
  }

  const ruleResults = await getRuleBasedRelatedPosts(db, post, limit)
  if (ruleResults.length > 0) {
    return {
      strategy: 'fts',
      source: 'rules',
      results: ruleResults,
    }
  }

  return {
    strategy: 'fts',
    source: 'fts',
    results: (await searchPosts(db, buildRelatedQuery(post) || post.title, limit + 1))
      .filter((candidate) => candidate.slug !== post.slug)
      .slice(0, limit),
  }
}

import { searchPosts } from '@/lib/repositories/search'
import type { RelatedSearchResult } from '@/lib/related-content/shared'
import { isVectorizeEnabled, tryVectorLookup } from '@/lib/related-content/vector'

type SearchPostsWithStrategyOptions = {
  limit?: number
}

export async function searchPostsWithStrategy(
  db: D1Database,
  env: Partial<CloudflareEnv> | null | undefined,
  query: string,
  options: SearchPostsWithStrategyOptions = {},
): Promise<RelatedSearchResult> {
  const limit = options.limit ?? 20
  const trimmedQuery = query.trim()
  if (!trimmedQuery) {
    return { strategy: isVectorizeEnabled(env) ? 'vectorize' : 'fts', source: 'rules', results: [] }
  }

  const vectorResults = await tryVectorLookup(db, env, trimmedQuery, null, limit)
  if (vectorResults && vectorResults.length > 0) {
    return {
      strategy: 'vectorize',
      source: 'vectorize',
      results: vectorResults,
    }
  }

  return {
    strategy: 'fts',
    source: 'fts',
    results: await searchPosts(db, trimmedQuery, limit),
  }
}

import type { Post, PostWithTags } from '@/lib/repositories/types'

export type RelatedStrategy = 'vectorize' | 'fts'
export type RelatedSource = 'vectorize' | 'fts' | 'rules'

export type RelatedSearchResult = {
  strategy: RelatedStrategy
  source: RelatedSource
  results: PostWithTags[]
}

export type PublicPostRow = Pick<
  Post,
  | 'id'
  | 'slug'
  | 'title'
  | 'content'
  | 'description'
  | 'category'
  | 'tags'
  | 'status'
  | 'password'
  | 'is_hidden'
  | 'deleted_at'
  | 'published_at'
>

export function readFlag(value: unknown): boolean {
  return typeof value === 'string' && ['1', 'true', 'yes', 'on'].includes(value.trim().toLowerCase())
}

export function parseTags(value: string | string[] | null | undefined): string[] {
  if (Array.isArray(value)) return value.filter((tag): tag is string => typeof tag === 'string' && tag.trim().length > 0)
  if (!value) return []
  try {
    const parsed = JSON.parse(value)
    return Array.isArray(parsed)
      ? parsed.filter((tag): tag is string => typeof tag === 'string' && tag.trim().length > 0)
      : []
  } catch {
    return []
  }
}

export function mapPost(post: Post): PostWithTags {
  return {
    ...post,
    status: post.deleted_at ? 'deleted' : (post.status || 'published'),
    tags: parseTags(post.tags),
  }
}

function normalizeText(text: string): string {
  return text
    .toLowerCase()
    .replace(/\r/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function extractCjkBigrams(text: string): string[] {
  const result: string[] = []
  const segments = text.match(/[\u3400-\u9fff]+/g) || []
  for (const segment of segments) {
    if (segment.length === 1) {
      result.push(segment)
      continue
    }
    for (let index = 0; index < segment.length - 1; index += 1) {
      result.push(segment.slice(index, index + 2))
    }
  }
  return result
}

export function tokenize(text: string): string[] {
  const normalized = normalizeText(text)
  if (!normalized) return []

  const latinWords = normalized.match(/[a-z0-9][a-z0-9_-]{1,31}/g) || []
  return [...latinWords, ...extractCjkBigrams(normalized)]
}

function hashToken(token: string): number {
  let hash = 2166136261
  for (let index = 0; index < token.length; index += 1) {
    hash ^= token.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }
  return hash >>> 0
}

export function buildHashedEmbedding(text: string, dimensions: number): number[] {
  const vector = new Array(Math.max(8, dimensions)).fill(0)
  const tokens = tokenize(text).slice(0, 1200)

  for (const token of tokens) {
    const hash = hashToken(token)
    const slot = hash % vector.length
    const sign = (hash & 1) === 0 ? 1 : -1
    const weight = token.length > 8 ? 1.6 : token.length > 3 ? 1.25 : 1
    vector[slot] += sign * weight
  }

  const magnitude = Math.sqrt(vector.reduce((sum, value) => sum + value * value, 0)) || 1
  return vector.map((value) => Number((value / magnitude).toFixed(6)))
}

export function buildPostVectorText(post: {
  title: string
  description?: string | null
  category?: string | null
  tags?: string[] | string | null
  content?: string | null
}): string {
  const pieces = [
    post.title,
    post.description || '',
    post.category || '',
    ...parseTags(post.tags),
    (post.content || '').slice(0, 6000),
  ].filter(Boolean)

  return pieces.join('\n')
}

export function buildRelatedQuery(post: PostWithTags): string {
  const parts = [
    post.title,
    post.category || '',
    ...post.tags.slice(0, 4),
  ].filter(Boolean)

  return parts.join(' ').trim()
}

export function buildTokenSet(post: {
  title: string
  description?: string | null
  category?: string | null
  tags?: string[]
}): Set<string> {
  return new Set(
    tokenize([
      post.title,
      post.description || '',
      post.category || '',
      ...(post.tags || []),
    ].join(' '))
  )
}

export function scoreCandidate(candidate: PostWithTags, current: PostWithTags, currentTokens: Set<string>, currentTags: Set<string>): number {
  let score = 0

  if (candidate.category && current.category && candidate.category === current.category) {
    score += 6
  }

  const sharedTags = candidate.tags.filter((tag) => currentTags.has(tag)).length
  score += sharedTags * 5

  const candidateTokens = buildTokenSet(candidate)
  let overlap = 0
  for (const token of candidateTokens) {
    if (currentTokens.has(token)) overlap += 1
  }
  score += Math.min(overlap, 10) * 0.8

  const freshnessBoost = Math.max(0, candidate.published_at - current.published_at)
  if (freshnessBoost > 0) score += 0.25

  return score
}

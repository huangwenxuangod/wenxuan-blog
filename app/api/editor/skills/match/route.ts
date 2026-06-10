import { NextRequest, NextResponse } from 'next/server'
import { getAppCloudflareEnv } from '@/lib/cloudflare'
import { ensureAuthenticatedRequest, AppError, withRouteErrorHandling } from '@/lib/server/route-helpers'
import { listSkills } from '@/lib/skills/repository'
import type { SkillRow, SkillSummary } from '@/lib/skills/types'
import { buildSkillCommandEntries } from '@/lib/ai-editor/skill-command'

function normalizeText(value: string) {
  return value
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s-]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function buildKeywordSet(skill: SkillSummary & { instructions?: string }) {
  const tokens = new Set<string>()
  const sources = [
    skill.name,
    skill.description,
    skill.instructions || '',
  ]

  for (const source of sources) {
    const normalized = normalizeText(source)
    for (const token of normalized.split(' ')) {
      if (token.length >= 2) tokens.add(token)
    }
  }

  return tokens
}

function computeSkillScore(query: string, skill: SkillSummary & { instructions?: string }) {
  const normalizedQuery = normalizeText(query)
  if (!normalizedQuery) return 0

  const commandEntry = buildSkillCommandEntries([skill])[0]
  const queryTokens = normalizedQuery.split(' ').filter(Boolean)
  const keywordSet = buildKeywordSet(skill)
  let score = 0

  if (normalizedQuery.includes(normalizeText(skill.name))) score += 12
  if (normalizedQuery.includes(commandEntry.trigger)) score += 14

  for (const token of queryTokens) {
    if (commandEntry.aliases.includes(token)) {
      score += 10
      continue
    }
    if (normalizeText(skill.name).includes(token)) score += 6
    if (normalizeText(skill.description).includes(token)) score += 4
    if (keywordSet.has(token)) score += 2
  }

  const text = `${skill.name} ${skill.description} ${skill.instructions || ''}`
  const normalizedText = normalizeText(text)

  if (/规划|方案|设计|思路|架构|plan|design/.test(query)) {
    if (normalizedText.includes('plan') || normalizedText.includes('设计') || normalizedText.includes('方案')) score += 10
  }
  if (/报错|排查|debug|fix|修复|错误|why broken/.test(query)) {
    if (normalizedText.includes('debug') || normalizedText.includes('排查') || normalizedText.includes('报错')) score += 10
  }
  if (/改写|润色|写作|rewrite|polish|翻译/.test(query)) {
    if (normalizedText.includes('rewrite') || normalizedText.includes('润色') || normalizedText.includes('translate')) score += 10
  }

  return score
}

export const POST = withRouteErrorHandling(async (req: NextRequest) => {
  const env = await getAppCloudflareEnv()
  const db = env?.DB as D1Database | undefined
  const authError = await ensureAuthenticatedRequest(req, db)
  if (authError) return authError
  if (!db) throw AppError.dbUnavailable()

  const body = await req.json().catch(() => ({})) as { query?: string }
  const query = (body.query || '').trim()
  if (!query) {
    return NextResponse.json({ match: null })
  }

  const skillRows = await db.prepare(`
    SELECT *
    FROM skills
    WHERE is_enabled = 1
    ORDER BY name ASC
  `).all<SkillRow>()

  const skills = (skillRows.results || []).map((row) => ({
    id: row.id,
    name: row.name,
    description: row.description,
    version: row.version,
    source: row.source,
    contentHash: row.content_hash,
    fileCount: 0,
    enabled: row.is_enabled === 1,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    instructions: row.instructions_text,
  }))

  const scored = skills
    .map((skill) => ({
      skill,
      score: computeSkillScore(query, skill),
    }))
    .sort((a, b) => b.score - a.score)

  const best = scored[0]
  if (!best || best.score < 8) {
    return NextResponse.json({ match: null })
  }

  const trigger = buildSkillCommandEntries([best.skill])[0]?.trigger || ''

  return NextResponse.json({
    match: {
      skillId: best.skill.id,
      name: best.skill.name,
      description: best.skill.description,
      trigger,
      score: best.score,
      reason: 'auto-match',
    },
  })
})

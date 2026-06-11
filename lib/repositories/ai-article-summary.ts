import { ensureSchema, type Database } from '@/lib/repositories/schema'

export interface AiArticleSummaryRow {
  id: number
  article_key: string
  user_summary: string
  article_summary: string
  session_summary: string
  updated_at: number
}

async function ensureAiArticleSummaryTable(db: Database) {
  await ensureSchema(db)

  await db.prepare(`
    CREATE TABLE IF NOT EXISTS ai_article_summaries (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      article_key TEXT NOT NULL UNIQUE,
      user_summary TEXT NOT NULL DEFAULT '',
      article_summary TEXT NOT NULL DEFAULT '',
      session_summary TEXT NOT NULL DEFAULT '',
      updated_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now'))
    )
  `).run()

  await db.prepare(`
    CREATE INDEX IF NOT EXISTS idx_ai_article_summaries_article_key
    ON ai_article_summaries(article_key)
  `).run()
}

export async function getAiArticleSummary(
  db: Database,
  articleKey: string,
): Promise<AiArticleSummaryRow | null> {
  await ensureAiArticleSummaryTable(db)

  return await db.prepare(`
    SELECT id, article_key, user_summary, article_summary, session_summary, updated_at
    FROM ai_article_summaries
    WHERE article_key = ?
    LIMIT 1
  `).bind(articleKey).first<AiArticleSummaryRow>() || null
}

export async function upsertAiArticleSummary(
  db: Database,
  articleKey: string,
  input: {
    userSummary?: string | null
    articleSummary?: string | null
    sessionSummary?: string | null
  },
) {
  await ensureAiArticleSummaryTable(db)

  const existing = await getAiArticleSummary(db, articleKey)

  const userSummary = (input.userSummary ?? existing?.user_summary ?? '').trim()
  const articleSummary = (input.articleSummary ?? existing?.article_summary ?? '').trim()
  const sessionSummary = (input.sessionSummary ?? existing?.session_summary ?? '').trim()

  if (existing) {
    await db.prepare(`
      UPDATE ai_article_summaries
      SET user_summary = ?, article_summary = ?, session_summary = ?, updated_at = strftime('%s', 'now')
      WHERE article_key = ?
    `).bind(
      userSummary,
      articleSummary,
      sessionSummary,
      articleKey,
    ).run()
    return
  }

  await db.prepare(`
    INSERT INTO ai_article_summaries (
      article_key,
      user_summary,
      article_summary,
      session_summary,
      updated_at
    ) VALUES (?, ?, ?, ?, strftime('%s', 'now'))
  `).bind(
    articleKey,
    userSummary,
    articleSummary,
    sessionSummary,
  ).run()
}

function clipText(text: string, max = 220) {
  const normalized = text.trim().replace(/\s+/g, ' ')
  return normalized.length > max ? `${normalized.slice(0, max - 1)}…` : normalized
}

function splitSummaryParts(summary: string) {
  return summary
    .split(/[；\n]+/)
    .map((part) => part.trim())
    .filter(Boolean)
}

function mergeSummaryParts(parts: Array<string | null | undefined>, maxItems: number, maxLength: number) {
  const seen = new Set<string>()
  const merged: string[] = []

  for (const part of parts) {
    const normalized = clipText(String(part || ''), maxLength)
    if (!normalized || seen.has(normalized)) continue
    seen.add(normalized)
    merged.push(normalized)
    if (merged.length >= maxItems) break
  }

  return clipText(merged.join('；'), maxLength)
}

const WORKSPACE_SUMMARY_KEY = '__workspace__'

export async function refreshWorkspaceSessionSummary(
  db: Database,
  input: {
    userMessage: string
    assistantMessage: string
    actionType?: string | null
    currentArticleSlug?: string | null
  },
) {
  const current = await getAiArticleSummary(db, WORKSPACE_SUMMARY_KEY)
  const tag = input.currentArticleSlug ? `[${input.currentArticleSlug}]` : '[全局]'

  const newParts = [
    input.userMessage ? `${tag} 用户：${clipText(input.userMessage)}` : '',
    input.assistantMessage ? `${tag} AI：${clipText(input.assistantMessage)}` : '',
    input.actionType ? `${tag} 动作：${input.actionType}` : '',
  ].filter(Boolean)

  const existingParts = splitSummaryParts(current?.session_summary || '')
  const merged = mergeSummaryParts([...existingParts, ...newParts], 10, 480)

  await upsertAiArticleSummary(db, WORKSPACE_SUMMARY_KEY, {
    sessionSummary: merged || current?.session_summary || '',
  })
}

export async function refreshAiArticleSummaryFromTurn(
  db: Database,
  articleKey: string,
  input: {
    userMessage: string
    assistantMessage: string
    actionType?: string | null
    title?: string | null
  },
) {
  const current = await getAiArticleSummary(db, articleKey)
  const userMessage = clipText(input.userMessage || '')
  const assistantMessage = clipText(input.assistantMessage || '')
  const title = (input.title || '').trim()
  const actionType = (input.actionType || '').trim()

  const nextUserSummary = mergeSummaryParts(
    [
      ...splitSummaryParts(current?.user_summary || ''),
      /希望|不要|尽量|语气|风格|表达|克制|简洁|口语|专业|默认|统一/i.test(userMessage)
        ? userMessage
        : '',
    ],
    3,
    220,
  )

  const articleSummaryCandidates = [
    title ? `标题：${title}` : '',
    /文章|这篇|目标|读者|受众|核心|重点|方向/i.test(userMessage)
      ? `当前诉求：${userMessage}`
      : '',
    actionType === 'create_post'
      ? '状态：已基于当前上下文创建新文章'
      : actionType === 'update_post'
        ? '状态：已完成一次跨文章更新'
        : actionType === 'generate_images'
          ? '状态：已执行当前文章配图任务'
          : '',
  ]

  const nextArticleSummary = mergeSummaryParts(
    [
      ...splitSummaryParts(current?.article_summary || ''),
      ...articleSummaryCandidates,
    ],
    4,
    280,
  )

  const nextSessionSummary = mergeSummaryParts(
    [
      ...splitSummaryParts(current?.session_summary || ''),
      userMessage ? `用户：${userMessage}` : '',
      assistantMessage ? `AI：${assistantMessage}` : '',
      actionType ? `动作：${actionType}` : '',
    ],
    6,
    320,
  )

  await upsertAiArticleSummary(db, articleKey, {
    userSummary: nextUserSummary,
    articleSummary: nextArticleSummary || current?.article_summary || '',
    sessionSummary: nextSessionSummary || current?.session_summary || '',
  })
}

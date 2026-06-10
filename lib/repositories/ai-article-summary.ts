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

  const nextUserSummary = current?.user_summary
    ? current.user_summary
    : /希望|不要|尽量|语气|风格|表达|克制|简洁|口语|专业/i.test(userMessage)
      ? clipText(userMessage, 180)
      : ''

  const nextArticleSummary = clipText(
    [
      title ? `标题：${title}` : '',
      userMessage ? `当前诉求：${userMessage}` : '',
    ].filter(Boolean).join('；'),
    260,
  )

  const nextSessionSummary = clipText(
    [
      userMessage ? `用户：${userMessage}` : '',
      assistantMessage ? `AI：${assistantMessage}` : '',
      actionType ? `动作：${actionType}` : '',
    ].filter(Boolean).join('；'),
    260,
  )

  await upsertAiArticleSummary(db, articleKey, {
    userSummary: nextUserSummary,
    articleSummary: nextArticleSummary || current?.article_summary || '',
    sessionSummary: nextSessionSummary || current?.session_summary || '',
  })
}

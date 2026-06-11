import { ensureSchema, type Database } from '@/lib/repositories/schema'
import { getAiArticleSummary } from '@/lib/repositories/ai-article-summary'

export interface AiArticleThreadRow {
  id: number
  article_key: string
  post_slug: string | null
  title: string | null
  created_at: number
  updated_at: number
}

export interface AiArticleMessageRow {
  id: number
  thread_id: number
  role: 'user' | 'assistant' | 'tool'
  content: string
  tool_name: string | null
  tool_payload: string | null
  created_at: number
}

async function ensureAiArticleThreadTables(db: Database) {
  await ensureSchema(db)

  await db.prepare(`
    CREATE TABLE IF NOT EXISTS ai_article_threads (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      article_key TEXT NOT NULL UNIQUE,
      post_slug TEXT,
      title TEXT,
      created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),
      updated_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now'))
    )
  `).run()

  await db.prepare(`
    CREATE INDEX IF NOT EXISTS idx_ai_article_threads_post_slug
    ON ai_article_threads(post_slug)
  `).run()

  await db.prepare(`
    CREATE TABLE IF NOT EXISTS ai_article_messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      thread_id INTEGER NOT NULL,
      role TEXT NOT NULL CHECK(role IN ('user', 'assistant', 'tool')),
      content TEXT NOT NULL,
      tool_name TEXT,
      tool_payload TEXT,
      created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),
      FOREIGN KEY (thread_id) REFERENCES ai_article_threads(id) ON DELETE CASCADE
    )
  `).run()

  await db.prepare(`
    CREATE INDEX IF NOT EXISTS idx_ai_article_messages_thread_id
    ON ai_article_messages(thread_id, created_at ASC)
  `).run()
}

function buildPostArticleKey(postSlug: string) {
  return `post:${postSlug.trim()}`
}

export function normalizeArticleKey(articleKey?: string | null, postSlug?: string | null) {
  const normalizedPostSlug = (postSlug || '').trim()
  if (normalizedPostSlug) {
    return buildPostArticleKey(normalizedPostSlug)
  }

  const normalizedArticleKey = (articleKey || '').trim()
  if (normalizedArticleKey) {
    return normalizedArticleKey
  }

  throw new Error('缺少文章会话标识')
}

export async function getOrCreateAiArticleThread(
  db: Database,
  input: {
    articleKey?: string | null
    postSlug?: string | null
    title?: string | null
  },
): Promise<AiArticleThreadRow> {
  await ensureAiArticleThreadTables(db)

  const normalizedPostSlug = (input.postSlug || '').trim() || null
  const preferredKey = normalizeArticleKey(input.articleKey, normalizedPostSlug)
  const fallbackKey = (input.articleKey || '').trim()
  const keysToCheck = Array.from(
    new Set([preferredKey, fallbackKey].filter(Boolean)),
  )

  for (const key of keysToCheck) {
    const thread = await db.prepare(`
      SELECT id, article_key, post_slug, title, created_at, updated_at
      FROM ai_article_threads
      WHERE article_key = ?
      LIMIT 1
    `).bind(key).first<AiArticleThreadRow>()

    if (!thread) continue

    const nextTitle = (input.title || '').trim()
    const needsKeyUpgrade = normalizedPostSlug && thread.article_key !== preferredKey
    const needsSlugSync = normalizedPostSlug && thread.post_slug !== normalizedPostSlug
    const needsTitleSync = nextTitle && thread.title !== nextTitle

    if (needsKeyUpgrade || needsSlugSync || needsTitleSync) {
      await db.prepare(`
        UPDATE ai_article_threads
        SET article_key = ?, post_slug = ?, title = ?, updated_at = strftime('%s', 'now')
        WHERE id = ?
      `).bind(
        normalizedPostSlug ? preferredKey : thread.article_key,
        normalizedPostSlug,
        nextTitle || thread.title,
        thread.id,
      ).run()

      const updated = await db.prepare(`
        SELECT id, article_key, post_slug, title, created_at, updated_at
        FROM ai_article_threads
        WHERE id = ?
      `).bind(thread.id).first<AiArticleThreadRow>()

      if (updated) return updated
    }

    return thread
  }

  await db.prepare(`
    INSERT INTO ai_article_threads (article_key, post_slug, title, created_at, updated_at)
    VALUES (?, ?, ?, strftime('%s', 'now'), strftime('%s', 'now'))
  `).bind(
    preferredKey,
    normalizedPostSlug,
    (input.title || '').trim() || null,
  ).run()

  const created = await db.prepare(`
    SELECT id, article_key, post_slug, title, created_at, updated_at
    FROM ai_article_threads
    WHERE article_key = ?
    LIMIT 1
  `).bind(preferredKey).first<AiArticleThreadRow>()

  if (!created) {
    throw new Error('创建文章会话失败')
  }

  return created
}

export async function listAiArticleMessages(
  db: Database,
  threadId: number,
  limit = 50,
): Promise<AiArticleMessageRow[]> {
  await ensureAiArticleThreadTables(db)

  const { results } = await db.prepare(`
    SELECT id, thread_id, role, content, tool_name, tool_payload, created_at
    FROM ai_article_messages
    WHERE thread_id = ?
    ORDER BY created_at DESC, id DESC
    LIMIT ?
  `).bind(threadId, Math.max(1, Math.min(limit, 200))).all<AiArticleMessageRow>()

  return [...(results || [])].reverse()
}

export async function appendAiArticleMessage(
  db: Database,
  input: {
    threadId: number
    role: 'user' | 'assistant' | 'tool'
    content: string
    toolName?: string | null
    toolPayload?: string | null
  },
) {
  await ensureAiArticleThreadTables(db)

  await db.prepare(`
    INSERT INTO ai_article_messages (thread_id, role, content, tool_name, tool_payload, created_at)
    VALUES (?, ?, ?, ?, ?, strftime('%s', 'now'))
  `).bind(
    input.threadId,
    input.role,
    input.content,
    input.toolName || null,
    input.toolPayload || null,
  ).run()

  await db.prepare(`
    UPDATE ai_article_threads
    SET updated_at = strftime('%s', 'now')
    WHERE id = ?
  `).bind(input.threadId).run()

  const inserted = await db.prepare(`
    SELECT id, thread_id, role, content, tool_name, tool_payload, created_at
    FROM ai_article_messages
    WHERE thread_id = ?
    ORDER BY id DESC
    LIMIT 1
  `).bind(input.threadId).first<AiArticleMessageRow>()

  return inserted || null
}

export async function updateAiArticleMessageContent(
  db: Database,
  input: {
    id: number
    threadId: number
    content: string
  },
) {
  await ensureAiArticleThreadTables(db)

  await db.prepare(`
    UPDATE ai_article_messages
    SET content = ?
    WHERE id = ? AND thread_id = ?
  `).bind(
    input.content,
    input.id,
    input.threadId,
  ).run()

  await db.prepare(`
    UPDATE ai_article_threads
    SET updated_at = strftime('%s', 'now')
    WHERE id = ?
  `).bind(input.threadId).run()
}

export async function updateLatestAiArticleToolPayload(
  db: Database,
  input: {
    threadId: number
    toolName: string
    toolPayload: string
  },
) {
  await ensureAiArticleThreadTables(db)

  const target = await db.prepare(`
    SELECT id
    FROM ai_article_messages
    WHERE thread_id = ? AND role = 'tool' AND tool_name = ?
    ORDER BY id DESC
    LIMIT 1
  `).bind(input.threadId, input.toolName).first<{ id: number }>()

  if (!target?.id) {
    return false
  }

  await db.prepare(`
    UPDATE ai_article_messages
    SET tool_payload = ?
    WHERE id = ? AND thread_id = ?
  `).bind(
    input.toolPayload,
    target.id,
    input.threadId,
  ).run()

  await db.prepare(`
    UPDATE ai_article_threads
    SET updated_at = strftime('%s', 'now')
    WHERE id = ?
  `).bind(input.threadId).run()

  return true
}

const WORKSPACE_ARTICLE_KEY = '__workspace__'

const COMPACTION_THRESHOLD = 50
const KEEP_RAW_COUNT = 20

export async function getOrCreateWorkspaceThread(db: Database): Promise<AiArticleThreadRow> {
  await ensureAiArticleThreadTables(db)

  const existing = await db.prepare(`
    SELECT id, article_key, post_slug, title, created_at, updated_at
    FROM ai_article_threads WHERE article_key = ? LIMIT 1
  `).bind(WORKSPACE_ARTICLE_KEY).first<AiArticleThreadRow>()

  if (existing) return existing

  await db.prepare(`
    INSERT INTO ai_article_threads (article_key, post_slug, title, created_at, updated_at)
    VALUES (?, NULL, 'AI 工作区', strftime('%s', 'now'), strftime('%s', 'now'))
  `).bind(WORKSPACE_ARTICLE_KEY).run()

  const created = await db.prepare(`
    SELECT id, article_key, post_slug, title, created_at, updated_at
    FROM ai_article_threads WHERE article_key = ? LIMIT 1
  `).bind(WORKSPACE_ARTICLE_KEY).first<AiArticleThreadRow>()

  if (!created) throw new Error('创建工作区会话失败')
  return created
}

export async function loadWorkspaceHistoryWithCompaction(
  db: Database,
  threadId: number,
): Promise<Array<{ role: 'user' | 'assistant'; content: string }>> {
  await ensureAiArticleThreadTables(db)

  const allMessages = await listAiArticleMessages(db, threadId, 100)

  const chatMessages = allMessages
    .filter((m): m is AiArticleMessageRow & { role: 'user' | 'assistant' } =>
      m.role === 'user' || m.role === 'assistant')
    .map((m) => ({ role: m.role, content: m.content }))

  if (chatMessages.length <= COMPACTION_THRESHOLD) return chatMessages

  const summary = await getAiArticleSummary(db, WORKSPACE_ARTICLE_KEY)
  const summaryText = summary?.session_summary?.trim()

  const recentMessages = chatMessages.slice(-KEEP_RAW_COUNT)

  if (!summaryText) return recentMessages

  return [
    { role: 'assistant', content: `📋 历史对话摘要（以下为早期对话压缩）：\n${summaryText}` },
    ...recentMessages,
  ]
}

export async function resetAiArticleThread(
  db: Database,
  input: {
    articleKey?: string | null
    postSlug?: string | null
  },
) {
  await ensureAiArticleThreadTables(db)

  const articleKey = normalizeArticleKey(input.articleKey, input.postSlug)
  const thread = await db.prepare(`
    SELECT id
    FROM ai_article_threads
    WHERE article_key = ?
    LIMIT 1
  `).bind(articleKey).first<{ id: number }>()

  if (!thread) return

  await db.prepare('DELETE FROM ai_article_messages WHERE thread_id = ?').bind(thread.id).run()
}

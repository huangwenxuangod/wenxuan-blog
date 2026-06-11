import { ensureSchema, type Database } from '@/lib/repositories/schema'
import type { AiEditorMemoryKind, AiEditorMemoryScope, AiEditorMemoryWrite } from '@/lib/ai-editor/types'

export interface AiArticleMemoryRow {
  id: number
  article_key: string
  scope: AiEditorMemoryScope
  kind: AiEditorMemoryKind
  title: string
  summary: string
  payload_json: string | null
  source_message_id: number | null
  source_tool_name: string | null
  confidence: number
  pinned: number
  archived: number
  created_at: number
  updated_at: number
}

export type MemoryTopicFamily = 'image' | 'title' | 'content' | 'post' | 'generic'

async function ensureAiArticleMemoryTable(db: Database) {
  await ensureSchema(db)

  await db.prepare(`
    CREATE TABLE IF NOT EXISTS ai_article_memory_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      article_key TEXT NOT NULL,
      scope TEXT NOT NULL CHECK(scope IN ('article', 'thread', 'user', 'workspace')),
      kind TEXT NOT NULL CHECK(kind IN ('fact', 'preference', 'decision', 'plan', 'style', 'image_style', 'open_task', 'completed_task')),
      title TEXT NOT NULL,
      summary TEXT NOT NULL,
      payload_json TEXT,
      source_message_id INTEGER,
      source_tool_name TEXT,
      confidence REAL NOT NULL DEFAULT 0.6,
      pinned INTEGER NOT NULL DEFAULT 0,
      archived INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),
      updated_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now'))
    )
  `).run()

  await db.prepare(`
    CREATE INDEX IF NOT EXISTS idx_ai_article_memory_items_article_key
    ON ai_article_memory_items(article_key, archived, updated_at DESC)
  `).run()
}

export async function listAiArticleMemoryItems(
  db: Database,
  articleKey: string,
  limit = 50,
) {
  await ensureAiArticleMemoryTable(db)

  const { results } = await db.prepare(`
    SELECT id, article_key, scope, kind, title, summary, payload_json, source_message_id, source_tool_name, confidence, pinned, archived, created_at, updated_at
    FROM ai_article_memory_items
    WHERE article_key = ?
    ORDER BY pinned DESC, updated_at DESC, id DESC
    LIMIT ?
  `).bind(articleKey, Math.max(1, Math.min(limit, 200))).all<AiArticleMemoryRow>()

  return results || []
}

function normalizeSummary(summary: string) {
  return summary.trim().replace(/\s+/g, ' ')
}

function safeParsePayload(payloadJson: string | null) {
  if (!payloadJson) return null

  try {
    const parsed = JSON.parse(payloadJson) as unknown
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? parsed as Record<string, unknown>
      : null
  } catch {
    return null
  }
}

export function inferMemoryTopicFamily(input: {
  summary?: string | null
  sourceToolName?: string | null
  payload?: Record<string, unknown> | null
}): MemoryTopicFamily {
  const summary = String(input.summary || '').toLowerCase()
  const sourceToolName = String(input.sourceToolName || '').toLowerCase()
  const payloadText = JSON.stringify(input.payload || {}).toLowerCase()
  const searchable = [summary, sourceToolName, payloadText].join('\n')

  if (/generate_images|配图|插图|封面|图片|视觉|illustration|image/.test(searchable)) {
    return 'image'
  }

  if (/标题|title/.test(searchable)) {
    return 'title'
  }

  if (/create_post|update_post|文章|slug|分类|发布|草稿/.test(searchable)) {
    return 'post'
  }

  if (/edit_selection|insert_block|rewrite|润色|改写|续写|段落|section|正文|内容/.test(searchable)) {
    return 'content'
  }

  return 'generic'
}

async function archiveMemoryRowsByIds(
  db: Database,
  ids: number[],
) {
  if (ids.length === 0) return

  const placeholders = ids.map(() => '?').join(', ')
  await db.prepare(`
    UPDATE ai_article_memory_items
    SET archived = 1, updated_at = strftime('%s', 'now')
    WHERE id IN (${placeholders})
  `).bind(...ids).run()
}

async function listActiveMemoryRowsByKind(
  db: Database,
  articleKey: string,
  kind: AiEditorMemoryKind,
) {
  const { results } = await db.prepare(`
    SELECT id, article_key, scope, kind, title, summary, payload_json, source_message_id, source_tool_name, confidence, pinned, archived, created_at, updated_at
    FROM ai_article_memory_items
    WHERE article_key = ? AND kind = ? AND archived = 0
    ORDER BY pinned DESC, updated_at DESC, id DESC
  `).bind(articleKey, kind).all<AiArticleMemoryRow>()

  return results || []
}

async function archiveOpenTasksForCompletedTask(
  db: Database,
  articleKey: string,
  input: {
    summary: string
    sourceToolName?: string | null
    payload?: Record<string, unknown> | null
  },
) {
  const completionFamily = inferMemoryTopicFamily(input)
  if (completionFamily === 'generic') return

  const activeOpenTasks = await listActiveMemoryRowsByKind(db, articleKey, 'open_task')
  const idsToArchive = activeOpenTasks
    .filter((row) => !row.pinned)
    .filter((row) => inferMemoryTopicFamily({
      summary: row.summary,
      sourceToolName: row.source_tool_name,
      payload: safeParsePayload(row.payload_json),
    }) === completionFamily)
    .map((row) => row.id)

  await archiveMemoryRowsByIds(db, idsToArchive)
}

export async function upsertAiArticleMemoryItem(
  db: Database,
  articleKey: string,
  input: AiEditorMemoryWrite & {
    sourceMessageId?: number | null
    sourceToolName?: string | null
  },
) {
  await ensureAiArticleMemoryTable(db)

  const normalizedTitle = input.title.trim()
  const normalizedSummary = normalizeSummary(input.summary)
  if (!normalizedTitle || !normalizedSummary) return

  if (input.kind === 'completed_task') {
    await archiveOpenTasksForCompletedTask(db, articleKey, {
      summary: normalizedSummary,
      sourceToolName: input.sourceToolName || null,
      payload: input.payload || null,
    })
  }

  const existing = await db.prepare(`
    SELECT id, article_key, scope, kind, title, summary, payload_json, source_message_id, source_tool_name, confidence, pinned, archived, created_at, updated_at
    FROM ai_article_memory_items
    WHERE article_key = ? AND scope = ? AND kind = ? AND title = ? AND archived = 0
    ORDER BY pinned DESC, updated_at DESC, id DESC
    LIMIT 1
  `).bind(
    articleKey,
    input.scope,
    input.kind,
    normalizedTitle,
  ).first<AiArticleMemoryRow>()

  const shouldVersionImageStyle = input.kind === 'image_style'
    && existing
    && normalizeSummary(existing.summary) !== normalizedSummary

  if (shouldVersionImageStyle && existing) {
    await archiveMemoryRowsByIds(db, [existing.id])
  }

  if (existing) {
    if (shouldVersionImageStyle) {
      // Fall through to insert a fresh active version after archiving the old one.
    } else {
    await db.prepare(`
      UPDATE ai_article_memory_items
      SET
        summary = ?,
        payload_json = ?,
        source_message_id = COALESCE(?, source_message_id),
        source_tool_name = COALESCE(?, source_tool_name),
        confidence = ?,
        pinned = ?,
        archived = ?,
        updated_at = strftime('%s', 'now')
      WHERE id = ?
    `).bind(
      normalizedSummary,
      input.payload ? JSON.stringify(input.payload) : null,
      input.sourceMessageId || null,
      input.sourceToolName || null,
      typeof input.confidence === 'number' ? input.confidence : existing.confidence,
      input.pinned ? 1 : 0,
      input.archived ? 1 : 0,
      existing.id,
    ).run()
    return
    }
  }

  if (input.kind === 'image_style') {
    const activeImageStyles = await listActiveMemoryRowsByKind(db, articleKey, 'image_style')
    const staleIds = activeImageStyles
      .filter((row) => !existing || row.id !== existing.id)
      .filter((row) => !row.pinned)
      .map((row) => row.id)
    await archiveMemoryRowsByIds(db, staleIds)
  }

  await db.prepare(`
    INSERT INTO ai_article_memory_items (
      article_key,
      scope,
      kind,
      title,
      summary,
      payload_json,
      source_message_id,
      source_tool_name,
      confidence,
      pinned,
      archived,
      created_at,
      updated_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, strftime('%s', 'now'), strftime('%s', 'now'))
  `).bind(
    articleKey,
    input.scope,
    input.kind,
    normalizedTitle,
    normalizedSummary,
    input.payload ? JSON.stringify(input.payload) : null,
    input.sourceMessageId || null,
    input.sourceToolName || null,
    typeof input.confidence === 'number' ? input.confidence : 0.6,
    input.pinned ? 1 : 0,
    input.archived ? 1 : 0,
  ).run()
}

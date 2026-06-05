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

  if (existing) {
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

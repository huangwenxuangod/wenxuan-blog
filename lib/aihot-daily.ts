const AIHOT_DAILY_URL = 'https://aihot.virxact.com/api/public/daily'
const AIHOT_USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.0.0 Safari/537.36'

export interface AihotDailyItem {
  title: string
  summary: string
  sourceUrl: string
  sourceName: string
}

export interface AihotDailySection {
  label: string
  items: AihotDailyItem[]
}

export interface AihotDailyPayload {
  date: string
  generatedAt: string
  windowStart?: string | null
  windowEnd?: string | null
  lead?: {
    title?: string | null
    leadParagraph?: string | null
  } | null
  sections: AihotDailySection[]
}

export interface AihotDailyCacheRow {
  date: string
  generated_at: string
  window_start: string | null
  window_end: string | null
  lead_title: string | null
  lead_paragraph: string | null
  sections_json: string
  raw_json: string
  source_url: string
  fetched_at: string
  status: string
}

export interface AihotDailyRecord {
  date: string
  generatedAt: string
  windowStart: string | null
  windowEnd: string | null
  leadTitle: string | null
  leadParagraph: string | null
  sections: AihotDailySection[]
  sourceUrl: string
  fetchedAt: string
  status: string
}

export interface AihotDailyListItem {
  date: string
  generatedAt: string
  leadTitle: string | null
  fetchedAt: string
  status: string
}

function normalizeText(value: unknown) {
  return typeof value === 'string' ? value.trim() : ''
}

function decodeUtf8IfNeeded(input: string) {
  if (!input.includes('Ã') && !input.includes('æ') && !input.includes('ï')) {
    return input
  }

  try {
    const bytes = Uint8Array.from(input, (char) => char.charCodeAt(0))
    const decoded = new TextDecoder('utf-8', { fatal: false }).decode(bytes)
    return decoded.includes('\uFFFD') ? input : decoded
  } catch {
    return input
  }
}

function cleanText(value: unknown) {
  return decodeUtf8IfNeeded(normalizeText(value))
}

function normalizeDailyPayload(payload: unknown): AihotDailyPayload {
  if (!payload || typeof payload !== 'object') {
    throw new Error('AI 日报响应格式无效')
  }

  const data = payload as Record<string, unknown>
  const date = cleanText(data.date)
  const generatedAt = cleanText(data.generatedAt)
  const sectionsInput = Array.isArray(data.sections) ? data.sections : []

  if (!date || !generatedAt || sectionsInput.length === 0) {
    throw new Error('AI 日报数据不完整')
  }

  const sections: AihotDailySection[] = sectionsInput
    .map((section) => {
      const sectionData = section && typeof section === 'object'
        ? section as Record<string, unknown>
        : {}

      const items = Array.isArray(sectionData.items) ? sectionData.items : []

      return {
        label: cleanText(sectionData.label),
        items: items
          .map((item) => {
            const itemData = item && typeof item === 'object'
              ? item as Record<string, unknown>
              : {}

            return {
              title: cleanText(itemData.title),
              summary: cleanText(itemData.summary),
              sourceUrl: cleanText(itemData.sourceUrl),
              sourceName: cleanText(itemData.sourceName),
            }
          })
          .filter((item) => item.title && item.sourceUrl),
      }
    })
    .filter((section) => section.label && section.items.length > 0)

  if (sections.length === 0) {
    throw new Error('AI 日报没有可用分栏')
  }

  const leadInput = data.lead && typeof data.lead === 'object'
    ? data.lead as Record<string, unknown>
    : null

  return {
    date,
    generatedAt,
    windowStart: cleanText(data.windowStart) || null,
    windowEnd: cleanText(data.windowEnd) || null,
    lead: leadInput ? {
      title: cleanText(leadInput.title) || null,
      leadParagraph: cleanText(leadInput.leadParagraph) || null,
    } : null,
    sections,
  }
}

export async function ensureAihotDailyTable(db: D1Database) {
  await db.prepare(`
    CREATE TABLE IF NOT EXISTS aihot_daily_cache (
      date TEXT PRIMARY KEY,
      generated_at TEXT NOT NULL,
      window_start TEXT,
      window_end TEXT,
      lead_title TEXT,
      lead_paragraph TEXT,
      sections_json TEXT NOT NULL,
      raw_json TEXT NOT NULL,
      source_url TEXT NOT NULL DEFAULT 'https://aihot.virxact.com/api/public/daily',
      fetched_at TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'ready'
    )
  `).run()

  await db.prepare(`
    CREATE INDEX IF NOT EXISTS idx_aihot_daily_cache_generated_at
    ON aihot_daily_cache(generated_at DESC)
  `).run()
}

export async function fetchAihotDaily() {
  const response = await fetch(AIHOT_DAILY_URL, {
    headers: {
      'User-Agent': AIHOT_USER_AGENT,
      'Accept': 'application/json',
    },
  })

  if (!response.ok) {
    throw new Error(`AI 日报拉取失败（${response.status}）`)
  }

  const payload = await response.json()
  return normalizeDailyPayload(payload)
}

export async function upsertAihotDaily(db: D1Database, payload: AihotDailyPayload) {
  await ensureAihotDailyTable(db)

  const fetchedAt = new Date().toISOString()
  const rawJson = JSON.stringify(payload)
  const sectionsJson = JSON.stringify(payload.sections)

  await db.prepare(`
    INSERT INTO aihot_daily_cache (
      date,
      generated_at,
      window_start,
      window_end,
      lead_title,
      lead_paragraph,
      sections_json,
      raw_json,
      source_url,
      fetched_at,
      status
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'ready')
    ON CONFLICT(date) DO UPDATE SET
      generated_at = excluded.generated_at,
      window_start = excluded.window_start,
      window_end = excluded.window_end,
      lead_title = excluded.lead_title,
      lead_paragraph = excluded.lead_paragraph,
      sections_json = excluded.sections_json,
      raw_json = excluded.raw_json,
      source_url = excluded.source_url,
      fetched_at = excluded.fetched_at,
      status = 'ready'
  `).bind(
    payload.date,
    payload.generatedAt,
    payload.windowStart || null,
    payload.windowEnd || null,
    payload.lead?.title || null,
    payload.lead?.leadParagraph || null,
    sectionsJson,
    rawJson,
    AIHOT_DAILY_URL,
    fetchedAt,
  ).run()

  return fetchedAt
}

export async function syncAihotDaily(db: D1Database) {
  const payload = await fetchAihotDaily()
  const fetchedAt = await upsertAihotDaily(db, payload)
  return {
    payload,
    fetchedAt,
  }
}

export function mapAihotDailyRow(row: AihotDailyCacheRow | null): AihotDailyRecord | null {
  if (!row) return null

  let sections: AihotDailySection[] = []

  try {
    const parsed = JSON.parse(row.sections_json) as AihotDailySection[]
    sections = Array.isArray(parsed) ? parsed : []
  } catch {
    sections = []
  }

  return {
    date: row.date,
    generatedAt: row.generated_at,
    windowStart: row.window_start,
    windowEnd: row.window_end,
    leadTitle: row.lead_title,
    leadParagraph: row.lead_paragraph,
    sections,
    sourceUrl: row.source_url,
    fetchedAt: row.fetched_at,
    status: row.status,
  }
}

export async function getLatestAihotDaily(db: D1Database) {
  await ensureAihotDailyTable(db)
  const row = await db.prepare(`
    SELECT
      date,
      generated_at,
      window_start,
      window_end,
      lead_title,
      lead_paragraph,
      sections_json,
      raw_json,
      source_url,
      fetched_at,
      status
    FROM aihot_daily_cache
    ORDER BY date DESC
    LIMIT 1
  `).first<AihotDailyCacheRow>()

  return mapAihotDailyRow(row)
}

export async function listAihotDailies(db: D1Database, limit = 90) {
  await ensureAihotDailyTable(db)
  const { results } = await db.prepare(`
    SELECT
      date,
      generated_at,
      lead_title,
      fetched_at,
      status
    FROM aihot_daily_cache
    ORDER BY date DESC
    LIMIT ?
  `).bind(Math.max(1, Math.min(limit, 365))).all<{
    date: string
    generated_at: string
    lead_title: string | null
    fetched_at: string
    status: string
  }>()

  return (results ?? []).map((row) => ({
    date: row.date,
    generatedAt: row.generated_at,
    leadTitle: row.lead_title,
    fetchedAt: row.fetched_at,
    status: row.status,
  })) satisfies AihotDailyListItem[]
}

export async function getAihotDailyByDate(db: D1Database, date: string) {
  await ensureAihotDailyTable(db)
  const row = await db.prepare(`
    SELECT
      date,
      generated_at,
      window_start,
      window_end,
      lead_title,
      lead_paragraph,
      sections_json,
      raw_json,
      source_url,
      fetched_at,
      status
    FROM aihot_daily_cache
    WHERE date = ?
    LIMIT 1
  `).bind(date).first<AihotDailyCacheRow>()

  return mapAihotDailyRow(row)
}

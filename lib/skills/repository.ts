import type { SkillRow, SkillSummary } from './types'

export interface SkillBucket {
  put(
    key: string,
    value: ArrayBuffer | ArrayBufferView,
    options?: { httpMetadata?: { contentType?: string } },
  ): Promise<void>
  delete(keys: string | string[]): Promise<void>
}

export async function ensureSkillsTable(db: D1Database) {
  await db.prepare(`
    CREATE TABLE IF NOT EXISTS skills (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      description TEXT NOT NULL,
      version TEXT NOT NULL DEFAULT '1.0.0',
      source TEXT NOT NULL DEFAULT 'upload',
      archive_key TEXT NOT NULL,
      skill_md_key TEXT NOT NULL,
      content_hash TEXT NOT NULL,
      instructions_text TEXT NOT NULL,
      file_manifest_json TEXT NOT NULL DEFAULT '[]',
      is_enabled INTEGER NOT NULL DEFAULT 1,
      created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),
      updated_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now'))
    )
  `).run()

  try {
    await db.prepare(`
      ALTER TABLE skills
      ADD COLUMN instructions_text TEXT NOT NULL DEFAULT ''
    `).run()
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    if (!/duplicate column name|already exists/i.test(message)) {
      throw error
    }
  }
}

function toSummary(row: SkillRow): SkillSummary {
  let fileCount = 0
  try {
    const manifest = JSON.parse(row.file_manifest_json) as unknown
    fileCount = Array.isArray(manifest) ? manifest.length : 0
  } catch {
    fileCount = 0
  }

  return {
    id: row.id,
    name: row.name,
    description: row.description,
    version: row.version,
    source: row.source,
    contentHash: row.content_hash,
    fileCount,
    enabled: row.is_enabled === 1,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

export async function listSkills(db: D1Database, enabledOnly = false) {
  await ensureSkillsTable(db)
  const query = enabledOnly
    ? 'SELECT * FROM skills WHERE is_enabled = 1 ORDER BY name ASC'
    : 'SELECT * FROM skills ORDER BY name ASC'
  const { results } = await db.prepare(query).all<SkillRow>()
  return results.map(toSummary)
}

export async function getSkillRow(db: D1Database, id: number) {
  await ensureSkillsTable(db)
  return db.prepare('SELECT * FROM skills WHERE id = ?').bind(id).first<SkillRow>()
}

export async function getEnabledSkillInstructions(
  db: D1Database,
  id: number,
) {
  const row = await getSkillRow(db, id)
  if (!row || row.is_enabled !== 1) return null
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    instructions: row.instructions_text,
  }
}

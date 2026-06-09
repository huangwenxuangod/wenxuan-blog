export interface SkillFrontmatter {
  name: string
  description: string
  version: string
}

export interface SkillArchiveEntry {
  path: string
  bytes: Uint8Array
}

export interface SkillRow {
  id: number
  name: string
  description: string
  version: string
  source: string
  archive_key: string
  skill_md_key: string
  content_hash: string
  instructions_text: string
  file_manifest_json: string
  is_enabled: number
  created_at: number
  updated_at: number
}

export interface SkillSummary {
  id: number
  name: string
  description: string
  version: string
  source: string
  contentHash: string
  fileCount: number
  enabled: boolean
  createdAt: number
  updatedAt: number
}

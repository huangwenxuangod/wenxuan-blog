import { NextRequest, NextResponse } from 'next/server'
import { getAppCloudflareEnv } from '@/lib/cloudflare'
import { ensureAuthenticatedRequest, AppError, withRouteErrorHandling } from '@/lib/server/route-helpers'
import { extractSkillArchive, resolveSkillRoot } from '@/lib/skills/archive'
import { parseSkillMarkdown, sha256Hex } from '@/lib/skills/manifest'
import {
  ensureSkillsTable,
  listSkills,
  type SkillBucket,
} from '@/lib/skills/repository'
import type { SkillRow } from '@/lib/skills/types'

function contentTypeForPath(path: string) {
  if (path.endsWith('.md')) return 'text/markdown; charset=utf-8'
  if (path.endsWith('.json')) return 'application/json'
  if (path.endsWith('.png')) return 'image/png'
  if (path.endsWith('.jpg') || path.endsWith('.jpeg')) return 'image/jpeg'
  if (path.endsWith('.webp')) return 'image/webp'
  if (path.endsWith('.svg')) return 'image/svg+xml'
  return 'application/octet-stream'
}

function toArrayBuffer(bytes: Uint8Array) {
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer
}

export const GET = withRouteErrorHandling(async (req: NextRequest) => {
  const env = await getAppCloudflareEnv()
  const db = env?.DB as D1Database | undefined
  const authError = await ensureAuthenticatedRequest(req, db)
  if (authError) return authError
  if (!db) throw AppError.dbUnavailable()

  return NextResponse.json({ skills: await listSkills(db) })
})

export const POST = withRouteErrorHandling(async (req: NextRequest) => {
  const env = await getAppCloudflareEnv()
  const db = env?.DB as D1Database | undefined
  const bucket = env?.SKILLS as unknown as SkillBucket | undefined
  const authError = await ensureAuthenticatedRequest(req, db)
  if (authError) return authError
  if (!db) throw AppError.dbUnavailable()
  if (!bucket) throw new AppError({ message: 'Skill R2 存储未配置', code: 'SKILLS_R2_UNAVAILABLE', status: 500 })

  const formData = await req.formData()
  const file = formData.get('file')
  if (!(file instanceof File)) throw AppError.badRequest('请选择 Skill ZIP 文件')
  if (!file.name.toLowerCase().endsWith('.zip')) throw AppError.badRequest('Skill 必须以 ZIP 格式上传')

  const archiveBuffer = await file.arrayBuffer()
  const archiveHash = await sha256Hex(archiveBuffer)
  const { rootName, skillMd, files } = resolveSkillRoot(await extractSkillArchive(archiveBuffer))
  const markdown = new TextDecoder().decode(skillMd.bytes)
  const { frontmatter, instructions } = parseSkillMarkdown(markdown)
  if (rootName && rootName !== frontmatter.name) {
    throw AppError.badRequest('Skill 顶层目录名必须与 frontmatter.name 一致')
  }

  await ensureSkillsTable(db)
  const existing = await db.prepare('SELECT * FROM skills WHERE name = ?')
    .bind(frontmatter.name)
    .first<SkillRow>()
  const storageRoot = `skills/${frontmatter.name}/${archiveHash.slice(0, 16)}`
  const archiveKey = `${storageRoot}/package.zip`
  const skillMdKey = `${storageRoot}/SKILL.md`
  const manifest = files.map((entry) => ({
    path: entry.path,
    size: entry.bytes.byteLength,
  }))

  await bucket.put(archiveKey, archiveBuffer, {
    httpMetadata: { contentType: 'application/zip' },
  })
  for (const entry of files) {
    await bucket.put(`${storageRoot}/files/${entry.path}`, toArrayBuffer(entry.bytes), {
      httpMetadata: { contentType: contentTypeForPath(entry.path) },
    })
  }
  await bucket.put(skillMdKey, toArrayBuffer(skillMd.bytes), {
    httpMetadata: { contentType: 'text/markdown; charset=utf-8' },
  })

  if (existing) {
    await db.prepare(`
      UPDATE skills
      SET description = ?, version = ?, archive_key = ?, skill_md_key = ?,
          content_hash = ?, instructions_text = ?, file_manifest_json = ?, updated_at = strftime('%s', 'now')
      WHERE id = ?
    `).bind(
      frontmatter.description,
      frontmatter.version,
      archiveKey,
      skillMdKey,
      archiveHash,
      instructions,
      JSON.stringify(manifest),
      existing.id,
    ).run()

    let oldManifest: Array<{ path?: string }> = []
    try {
      oldManifest = JSON.parse(existing.file_manifest_json || '[]') as Array<{ path?: string }>
    } catch {
      oldManifest = []
    }
    const oldRoot = existing.archive_key.slice(0, -'/package.zip'.length)
    const oldKeys = [
      existing.archive_key,
      existing.skill_md_key,
      ...oldManifest.flatMap((item) => item.path ? [`${oldRoot}/files/${item.path}`] : []),
    ].filter((key) => !key.startsWith(storageRoot))
    if (oldKeys.length > 0) await bucket.delete(oldKeys)
  } else {
    await db.prepare(`
      INSERT INTO skills (
        name, description, version, source, archive_key, skill_md_key,
        content_hash, instructions_text, file_manifest_json, is_enabled
      ) VALUES (?, ?, ?, 'upload', ?, ?, ?, ?, ?, 1)
    `).bind(
      frontmatter.name,
      frontmatter.description,
      frontmatter.version,
      archiveKey,
      skillMdKey,
      archiveHash,
      instructions,
      JSON.stringify(manifest),
    ).run()
  }

  return NextResponse.json({
    success: true,
    skill: {
      name: frontmatter.name,
      description: frontmatter.description,
      version: frontmatter.version,
      contentHash: archiveHash,
      fileCount: files.length,
    },
  })
})

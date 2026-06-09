import { describe, expect, it } from 'vitest'
import { deflateRawSync } from 'node:zlib'
import { extractSkillArchive, resolveSkillRoot } from '@/lib/skills/archive'
import { parseSkillMarkdown } from '@/lib/skills/manifest'
import { appendSkillInstructions } from '@/lib/skills/prompt'
import { getEnabledSkillInstructions } from '@/lib/skills/repository'

function writeUint16(target: number[], value: number) {
  target.push(value & 0xff, (value >>> 8) & 0xff)
}

function writeUint32(target: number[], value: number) {
  target.push(
    value & 0xff,
    (value >>> 8) & 0xff,
    (value >>> 16) & 0xff,
    (value >>> 24) & 0xff,
  )
}

function createZip(files: Array<{ path: string; content: string }>, compression: 'store' | 'deflate' = 'store') {
  const encoder = new TextEncoder()
  const local: number[] = []
  const central: number[] = []

  for (const file of files) {
    const name = encoder.encode(file.path)
    const content = encoder.encode(file.content)
    const compressed = compression === 'deflate'
      ? new Uint8Array(deflateRawSync(content))
      : content
    const method = compression === 'deflate' ? 8 : 0
    const localOffset = local.length

    writeUint32(local, 0x04034b50)
    writeUint16(local, 20)
    writeUint16(local, 0)
    writeUint16(local, method)
    writeUint16(local, 0)
    writeUint16(local, 0)
    writeUint32(local, 0)
    writeUint32(local, compressed.length)
    writeUint32(local, content.length)
    writeUint16(local, name.length)
    writeUint16(local, 0)
    local.push(...name, ...compressed)

    writeUint32(central, 0x02014b50)
    writeUint16(central, 20)
    writeUint16(central, 20)
    writeUint16(central, 0)
    writeUint16(central, method)
    writeUint16(central, 0)
    writeUint16(central, 0)
    writeUint32(central, 0)
    writeUint32(central, compressed.length)
    writeUint32(central, content.length)
    writeUint16(central, name.length)
    writeUint16(central, 0)
    writeUint16(central, 0)
    writeUint16(central, 0)
    writeUint16(central, 0)
    writeUint32(central, 0)
    writeUint32(central, localOffset)
    central.push(...name)
  }

  const output = [...local, ...central]
  writeUint32(output, 0x06054b50)
  writeUint16(output, 0)
  writeUint16(output, 0)
  writeUint16(output, files.length)
  writeUint16(output, files.length)
  writeUint32(output, central.length)
  writeUint32(output, local.length)
  writeUint16(output, 0)
  return Uint8Array.from(output).buffer
}

const skillMarkdown = `---
name: article-rewriter
description: Rewrite the current article selection.
version: 1.2.0
---

# Instructions

Prefer the current selection and preserve factual meaning.
`

describe('Agent Skill packages', () => {
  it('parses the required Agent Skills frontmatter', () => {
    const parsed = parseSkillMarkdown(skillMarkdown)
    expect(parsed.frontmatter).toEqual({
      name: 'article-rewriter',
      description: 'Rewrite the current article selection.',
      version: '1.2.0',
    })
    expect(parsed.instructions).toContain('Prefer the current selection')
  })

  it('extracts a standard skill directory from ZIP', async () => {
    const archive = createZip([
      { path: 'article-rewriter/SKILL.md', content: skillMarkdown },
      { path: 'article-rewriter/references/style.md', content: '# Style' },
    ])
    const resolved = resolveSkillRoot(await extractSkillArchive(archive))
    expect(resolved.files.map((entry) => entry.path)).toEqual([
      'SKILL.md',
      'references/style.md',
    ])
    expect(resolved.rootName).toBe('article-rewriter')
  })

  it('extracts a deflated ZIP package', async () => {
    const archive = createZip([
      { path: 'article-rewriter/SKILL.md', content: skillMarkdown },
    ], 'deflate')
    const resolved = resolveSkillRoot(await extractSkillArchive(archive))
    expect(new TextDecoder().decode(resolved.skillMd.bytes)).toContain('article-rewriter')
  })

  it('rejects path traversal in a ZIP package', async () => {
    const archive = createZip([
      { path: '../SKILL.md', content: skillMarkdown },
    ])
    await expect(extractSkillArchive(archive)).rejects.toThrow('不安全路径')
  })

  it('injects only an explicitly active skill', () => {
    expect(appendSkillInstructions('base')).toBe('base')
    expect(appendSkillInstructions('base', {
      name: 'article-rewriter',
      description: 'Rewrite article text.',
      instructions: 'Preserve facts.',
    })).toContain('## Active Skill')
  })

  it('reads validated instructions from DB without reparsing R2 markdown', async () => {
    const db = {
      prepare() {
        return {
          bind() {
            return {
              first: async () => ({
                id: 1,
                name: 'article-rewriter',
                description: 'Rewrite article text.',
                version: '1.2.0',
                source: 'upload',
                archive_key: 'skills/article-rewriter/hash/package.zip',
                skill_md_key: 'skills/article-rewriter/hash/SKILL.md',
                content_hash: 'abc',
                instructions_text: 'Use concise wording.',
                file_manifest_json: '[]',
                is_enabled: 1,
                created_at: 0,
                updated_at: 0,
              }),
            }
          },
          run: async () => ({ meta: { last_row_id: 1 } }),
        }
      },
    } as unknown as D1Database

    await expect(getEnabledSkillInstructions(db, 1)).resolves.toEqual({
      id: 1,
      name: 'article-rewriter',
      description: 'Rewrite article text.',
      instructions: 'Use concise wording.',
    })
  })
})

import type { SkillFrontmatter } from './types'

const NAME_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

function unquote(value: string) {
  const trimmed = value.trim()
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"'))
    || (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1)
  }
  return trimmed
}

export function parseSkillMarkdown(markdown: string): {
  frontmatter: SkillFrontmatter
  instructions: string
} {
  const normalized = markdown.replace(/^\uFEFF/, '').replaceAll('\r\n', '\n')
  if (!normalized.startsWith('---\n')) {
    throw new Error('SKILL.md 必须以 YAML frontmatter 开头')
  }

  const end = normalized.indexOf('\n---\n', 4)
  if (end < 0) throw new Error('SKILL.md frontmatter 未闭合')

  const values = new Map<string, string>()
  for (const line of normalized.slice(4, end).split('\n')) {
    if (!line.trim() || line.trimStart().startsWith('#')) continue
    const separator = line.indexOf(':')
    if (separator < 1) continue
    values.set(line.slice(0, separator).trim(), unquote(line.slice(separator + 1)))
  }

  const name = values.get('name') || ''
  const description = values.get('description') || ''
  const version = values.get('version') || '1.0.0'

  if (!NAME_PATTERN.test(name) || name.length > 64) {
    throw new Error('Skill name 必须是 1-64 位小写字母、数字或连字符')
  }
  if (!description || description.length > 1024) {
    throw new Error('Skill description 必须为 1-1024 个字符')
  }
  if (version.length > 64) {
    throw new Error('Skill version 不能超过 64 个字符')
  }

  const instructions = normalized.slice(end + 5).trim()
  if (!instructions) throw new Error('SKILL.md 必须包含指令正文')

  return {
    frontmatter: { name, description, version },
    instructions,
  }
}

export async function sha256Hex(buffer: ArrayBuffer) {
  const digest = await crypto.subtle.digest('SHA-256', buffer)
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('')
}

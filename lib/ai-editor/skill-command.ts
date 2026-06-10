export interface SkillCommandEntry {
  id: number
  name: string
  description: string
  trigger: string
  aliases: string[]
}

export interface SkillCommandSource {
  id: number
  name: string
  description: string
}

export interface ParsedSkillCommandResult {
  matchedSkillId: number | null
  messageWithoutCommand: string
  trigger: string | null
  mode: 'manual' | 'none'
}

function normalizeCommandToken(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
}

export function buildSkillCommandEntries(skills: SkillCommandSource[]): SkillCommandEntry[] {
  return skills.map((skill) => {
    const trigger = normalizeCommandToken(skill.name)
    const aliases = Array.from(
      new Set([
        trigger,
        normalizeCommandToken(skill.name.replace(/\s+/g, '-')),
      ].filter(Boolean)),
    )

    return {
      id: skill.id,
      name: skill.name,
      description: skill.description,
      trigger,
      aliases,
    }
  })
}

export function parseSkillCommandInput(
  rawInput: string,
  entries: SkillCommandEntry[],
): ParsedSkillCommandResult {
  const input = rawInput.trim()
  if (!input.startsWith('/')) {
    return {
      matchedSkillId: null,
      messageWithoutCommand: rawInput.trim(),
      trigger: null,
      mode: 'none',
    }
  }

  const directMatch = input.match(/^\/([a-zA-Z0-9-]+)(?:\s+([\s\S]*))?$/)
  if (!directMatch) {
    return {
      matchedSkillId: null,
      messageWithoutCommand: rawInput.trim(),
      trigger: null,
      mode: 'none',
    }
  }

  const commandName = normalizeCommandToken(directMatch[1] || '')
  const rest = (directMatch[2] || '').trim()

  if (commandName === 'skill') {
    const nested = rest.match(/^([a-zA-Z0-9-]+)(?:\s+([\s\S]*))?$/)
    if (!nested) {
      return {
        matchedSkillId: null,
        messageWithoutCommand: rest,
        trigger: null,
        mode: 'none',
      }
    }

    const nestedCommand = normalizeCommandToken(nested[1] || '')
    const nestedRest = (nested[2] || '').trim()
    const matchedEntry = entries.find((entry) => entry.aliases.includes(nestedCommand))

    return {
      matchedSkillId: matchedEntry?.id ?? null,
      messageWithoutCommand: nestedRest,
      trigger: matchedEntry?.trigger ?? (nestedCommand || null),
      mode: matchedEntry ? 'manual' : 'none',
    }
  }

  const matchedEntry = entries.find((entry) => entry.aliases.includes(commandName))
  if (!matchedEntry) {
    return {
      matchedSkillId: null,
      messageWithoutCommand: rest,
      trigger: commandName || null,
      mode: 'none',
    }
  }

  return {
    matchedSkillId: matchedEntry.id,
    messageWithoutCommand: rest,
    trigger: matchedEntry.trigger,
    mode: 'manual',
  }
}

export function getSkillSlashQuery(rawInput: string) {
  const trimmedLeft = rawInput.replace(/^\s+/, '')
  if (!trimmedLeft.startsWith('/')) return ''

  const firstLine = trimmedLeft.split('\n')[0] || ''
  const match = firstLine.match(/^\/([a-zA-Z0-9-]*)$/)
  if (match) {
    return normalizeCommandToken(match[1] || '')
  }

  const skillMatch = firstLine.match(/^\/skill\s+([a-zA-Z0-9-]*)$/)
  if (skillMatch) {
    return normalizeCommandToken(skillMatch[1] || '')
  }

  return ''
}

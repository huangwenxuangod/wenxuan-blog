import type { AiEditorMemoryItem, EditorDocumentBlock } from '@/lib/ai-editor/types'

interface RetrieveBlocksInput {
  outline: EditorDocumentBlock[]
  userMessage: string
  activeBlockIndex?: number | null
  limit?: number
}

interface RetrieveMemoryInput {
  memoryItems: AiEditorMemoryItem[]
  userMessage: string
  limit?: number
}

function unique<T>(items: T[]) {
  return Array.from(new Set(items))
}

function extractSearchTokens(text: string) {
  const tokens = (text.toLowerCase().match(/[a-z0-9_-]{2,}|[\u4e00-\u9fff]{1,12}/g) || [])
    .flatMap((token) => {
      if (/^[\u4e00-\u9fff]+$/.test(token)) {
        return [token, ...token.split('')]
      }
      return [token]
    })
    .filter((token) => token.trim().length >= 1)

  return unique(tokens)
}

function scoreBlock(
  block: EditorDocumentBlock,
  tokens: string[],
  activeBlockIndex: number | null,
  activeSectionIndex: number | null,
  wantsImage: boolean,
) {
  let score = 0

  if (activeBlockIndex !== null && block.index === activeBlockIndex) score += 16
  if (activeBlockIndex !== null && Math.abs(block.index - activeBlockIndex) === 1) score += 7
  if (activeSectionIndex !== null && block.sectionIndex === activeSectionIndex) score += 6
  if (block.semanticRole === 'heading') score += 1
  if (wantsImage && block.isVisualCandidate) score += 6

  const searchable = [
    block.text,
    block.sectionTitle || '',
    block.headingPath.join(' / '),
  ].join('\n').toLowerCase()

  for (const token of tokens) {
    if (!token) continue
    if (searchable.includes(token)) {
      score += token.length >= 2 ? 3 : 1
    }
  }

  return score
}

export function retrieveRelevantBlocks(input: RetrieveBlocksInput) {
  const tokens = extractSearchTokens(input.userMessage)
  const wantsImage = /(图|配图|插图|封面|图片|视觉|illustration|image)/i.test(input.userMessage)
  const activeBlockIndex = Number.isInteger(input.activeBlockIndex)
    ? Number(input.activeBlockIndex)
    : null
  const activeSectionIndex = activeBlockIndex !== null
    ? (input.outline.find((block) => block.index === activeBlockIndex)?.sectionIndex ?? null)
    : null
  const limit = Math.max(1, Math.min(input.limit || 5, 8))

  const scored = input.outline
    .map((block) => ({
      block,
      score: scoreBlock(block, tokens, activeBlockIndex, activeSectionIndex, wantsImage),
    }))
    .filter((item) => item.score > 0)
    .sort((left, right) => right.score - left.score || left.block.index - right.block.index)

  const relevantBlocks = scored.slice(0, limit).map((item) => item.block)
  const supportingBlocks = input.outline.filter((block) => (
    activeBlockIndex !== null
      ? Math.abs(block.index - activeBlockIndex) <= 2 && block.index !== activeBlockIndex
      : false
  )).slice(0, 4)
  const visualCandidateBlocks = input.outline
    .filter((block) => block.isVisualCandidate)
    .sort((left, right) => (
      scoreBlock(right, tokens, activeBlockIndex, activeSectionIndex, true)
      - scoreBlock(left, tokens, activeBlockIndex, activeSectionIndex, true)
    ))
    .slice(0, 4)

  return {
    relevantBlocks,
    supportingBlocks,
    visualCandidateBlocks,
  }
}

function scoreMemory(item: AiEditorMemoryItem, tokens: string[]) {
  let score = item.pinned ? 8 : 0
  score += item.confidence || 0

  const searchable = [
    item.title,
    item.summary,
    JSON.stringify(item.payload || {}),
  ].join('\n').toLowerCase()

  for (const token of tokens) {
    if (!token) continue
    if (searchable.includes(token)) {
      score += token.length >= 2 ? 4 : 1
    }
  }

  return score
}

export function retrieveRelevantMemoryItems(input: RetrieveMemoryInput) {
  const tokens = extractSearchTokens(input.userMessage)
  const limit = Math.max(1, Math.min(input.limit || 4, 8))

  return input.memoryItems
    .filter((item) => !item.archived)
    .map((item) => ({
      item,
      score: scoreMemory(item, tokens),
    }))
    .filter((entry) => entry.score > 0 || entry.item.pinned)
    .sort((left, right) => right.score - left.score)
    .slice(0, limit)
    .map((entry) => entry.item)
}

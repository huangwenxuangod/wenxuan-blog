import type { JSONContent } from 'novel'
import type { EditorDocumentBlock, EditorDocumentSemanticRole } from '@/lib/ai-editor/types'

function getNodeText(node: JSONContent | string | null | undefined): string {
  if (!node) return ''
  if (typeof node === 'string') return node

  const text = typeof node.text === 'string' ? node.text : ''
  const nested = Array.isArray(node.content)
    ? node.content.map((child) => getNodeText(child)).join('')
    : ''

  return `${text}${nested}`.trim()
}

function isVisualCandidateType(type: string) {
  return [
    'paragraph',
    'heading',
    'blockquote',
    'bulletList',
    'orderedList',
    'listItem',
  ].includes(type)
}

function normalizeHeadingText(text: string, fallbackIndex: number) {
  return text.trim() || `未命名标题 ${fallbackIndex + 1}`
}

function getHeadingLevel(node: JSONContent | null | undefined) {
  const level = node?.attrs && typeof node.attrs === 'object' && 'level' in node.attrs
    ? Number(node.attrs.level)
    : NaN

  return Number.isFinite(level) && level >= 1 && level <= 6 ? level : null
}

function inferSemanticRole(
  type: string,
  index: number,
  total: number,
  headingLevel: number | null,
): EditorDocumentSemanticRole {
  if (headingLevel !== null || type === 'heading') return 'heading'
  if (type === 'blockquote') return 'quote'
  if (type === 'bulletList' || type === 'orderedList' || type === 'listItem') return 'list'
  if (type === 'image' || type === 'video' || type === 'audio') return 'media'
  if (index <= 1) return 'intro'
  if (index >= Math.max(total - 2, 0)) return 'summary'
  if (type === 'paragraph') return 'body'
  return 'unknown'
}

export function buildEditorDocumentOutline(document: JSONContent | null | undefined): EditorDocumentBlock[] {
  if (!document || !Array.isArray(document.content)) return []

  const blocks: EditorDocumentBlock[] = []
  const headingStack: Array<{ level: number; title: string }> = []
  let currentSectionIndex = 0
  let currentSectionTitle: string | null = null

  document.content.forEach((node, index, source) => {
    const type = node?.type || 'unknown'
    const text = getNodeText(node)
    const headingLevel = getHeadingLevel(node)

    if (headingLevel !== null) {
      while (headingStack.length > 0 && headingStack[headingStack.length - 1]!.level >= headingLevel) {
        headingStack.pop()
      }

      const headingTitle = normalizeHeadingText(text, index)
      headingStack.push({
        level: headingLevel,
        title: headingTitle,
      })
      currentSectionIndex += 1
      currentSectionTitle = headingTitle
    }

    const headingPath = headingStack.map((item) => item.title)
    const charCount = Array.from(text).length

    blocks.push({
      blockId: `block-${index + 1}`,
      index,
      type,
      text,
      charCount,
      path: [index],
      headingLevel,
      headingPath,
      sectionIndex: currentSectionIndex,
      sectionTitle: currentSectionTitle,
      semanticRole: inferSemanticRole(type, index, source.length, headingLevel),
      previousBlockIndex: index > 0 ? index - 1 : null,
      nextBlockIndex: index < source.length - 1 ? index + 1 : null,
      isVisualCandidate: isVisualCandidateType(type) && charCount >= 30,
    })
  })

  return blocks
}

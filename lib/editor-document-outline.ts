import type { JSONContent } from 'novel'

export interface EditorDocumentBlock {
  blockId: string
  index: number
  type: string
  text: string
  charCount: number
  path: number[]
  isVisualCandidate: boolean
}

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

export function buildEditorDocumentOutline(document: JSONContent | null | undefined): EditorDocumentBlock[] {
  if (!document || !Array.isArray(document.content)) return []

  const blocks: EditorDocumentBlock[] = []

  document.content.forEach((node, index) => {
    const type = node?.type || 'unknown'
    const text = getNodeText(node)
    blocks.push({
      blockId: `block-${index + 1}`,
      index,
      type,
      text,
      charCount: Array.from(text).length,
      path: [index],
      isVisualCandidate: isVisualCandidateType(type) && Array.from(text).length >= 30,
    })
  })

  return blocks
}

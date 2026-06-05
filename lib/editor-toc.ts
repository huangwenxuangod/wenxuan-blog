import type { JSONContent } from 'novel'

const MAX_TOC_LEVEL = 4

export interface EditorTocItem {
  id: string
  level: number
  text: string
  index: number
  parentId: string | null
  children: EditorTocItem[]
}

function extractText(node: JSONContent | undefined): string {
  if (!node) return ''
  const ownText = typeof node.text === 'string' ? node.text : ''
  const nested = Array.isArray(node.content)
    ? node.content.map((child) => extractText(child)).join('')
    : ''
  return `${ownText}${nested}`.trim()
}

export function flattenEditorToc(items: EditorTocItem[]): EditorTocItem[] {
  return items.flatMap((item) => [item, ...flattenEditorToc(item.children)])
}

export function buildEditorToc(document: JSONContent | null | undefined): EditorTocItem[] {
  if (!document?.content || !Array.isArray(document.content)) return []

  const roots: EditorTocItem[] = []
  const stack: EditorTocItem[] = []

  document.content.forEach((node, index) => {
    if (node?.type !== 'heading') return

    const rawLevel = Number(node.attrs?.level)
    const level = Math.min(MAX_TOC_LEVEL, Math.max(1, Number.isFinite(rawLevel) ? rawLevel : 1))
    const originalLevel = Number.isFinite(rawLevel) ? rawLevel : 1
    if (originalLevel > MAX_TOC_LEVEL) return

    const text = extractText(node)
    if (!text) return

    while (stack.length > 0 && stack[stack.length - 1]!.level >= level) {
      stack.pop()
    }

    const parent = stack[stack.length - 1] ?? null
    const item: EditorTocItem = {
      id: `toc-heading-${index}`,
      level,
      text,
      index,
      parentId: parent?.id ?? null,
      children: [],
    }

    if (parent) {
      parent.children.push(item)
    } else {
      roots.push(item)
    }

    stack.push(item)
  })

  return roots
}

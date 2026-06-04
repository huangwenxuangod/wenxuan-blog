import type { JSONContent } from 'novel'
import { buildEditorDocumentOutline } from '@/lib/editor-document-outline'

export interface AiEditorContextInput {
  title: string
  documentText: string
  documentJson?: JSONContent | null
  postSlug?: string | null
}

export function buildAiEditorContext(input: AiEditorContextInput) {
  const outline = buildEditorDocumentOutline(input.documentJson)
  const normalizedTitle = input.title.trim()
  const normalizedText = input.documentText.trim()

  return {
    title: normalizedTitle,
    postSlug: (input.postSlug || '').trim() || null,
    fullText: normalizedText,
    outline,
    outlineText: outline
      .map((block) => {
        const preview = block.text.length > 180
          ? `${block.text.slice(0, 180)}…`
          : block.text
        return `#${block.index + 1} [${block.type}] ${preview || '(空块)'}`
      })
      .join('\n'),
  }
}

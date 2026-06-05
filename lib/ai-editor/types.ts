import type { JSONContent } from 'novel'

export type EditorDocumentSemanticRole =
  | 'heading'
  | 'intro'
  | 'body'
  | 'summary'
  | 'list'
  | 'quote'
  | 'media'
  | 'unknown'

export interface EditorDocumentBlock {
  blockId: string
  index: number
  type: string
  text: string
  charCount: number
  path: number[]
  headingLevel: number | null
  headingPath: string[]
  sectionIndex: number
  sectionTitle: string | null
  semanticRole: EditorDocumentSemanticRole
  previousBlockIndex: number | null
  nextBlockIndex: number | null
  isVisualCandidate: boolean
}

export type AiEditorMemoryScope = 'article' | 'thread' | 'user' | 'workspace'

export type AiEditorMemoryKind =
  | 'fact'
  | 'preference'
  | 'decision'
  | 'plan'
  | 'style'
  | 'image_style'
  | 'open_task'
  | 'completed_task'

export interface AiEditorMemoryItem {
  id: number | string
  articleKey?: string | null
  scope: AiEditorMemoryScope
  kind: AiEditorMemoryKind
  title: string
  summary: string
  payload?: Record<string, unknown> | null
  sourceMessageId?: number | null
  sourceToolName?: string | null
  confidence: number
  pinned: boolean
  archived: boolean
  createdAt?: number
  updatedAt?: number
}

export interface AiEditorThreadMessage {
  role: 'user' | 'assistant'
  content: string
}

export interface AiEditorDocumentSnapshot {
  title: string
  postSlug: string | null
  wordCount: number
  articleSummary: string
  outline: Array<{
    index: number
    heading: string
    level: number
  }>
  topHeadings: string[]
  dominantTopics: string[]
}

export interface AiEditorFocusedContext {
  activeBlock: EditorDocumentBlock | null
  activeHeadingPath: string[]
  currentSectionTitle: string | null
  selectionText: string | null
  previousBlocks: EditorDocumentBlock[]
  nextBlocks: EditorDocumentBlock[]
  currentSectionBlocks: EditorDocumentBlock[]
}

export interface AiEditorRetrievedContext {
  relevantBlocks: EditorDocumentBlock[]
  supportingBlocks: EditorDocumentBlock[]
  visualCandidateBlocks: EditorDocumentBlock[]
  memoryItems: AiEditorMemoryItem[]
}

export interface AiEditorThreadContext {
  recentMessages: AiEditorThreadMessage[]
  threadSummary: string
  acceptedDecisions: string[]
  pendingTasks: string[]
  activeImageStyle: string | null
}

export interface AiEditorContextInput {
  title: string
  documentText: string
  documentJson?: JSONContent | null
  postSlug?: string | null
  userMessage?: string
  history?: AiEditorThreadMessage[]
  memoryItems?: AiEditorMemoryItem[]
  activeBlockIndex?: number | null
  selectionText?: string | null
}

export interface AiEditorContext {
  title: string
  postSlug: string | null
  fullText: string
  outline: EditorDocumentBlock[]
  outlineText: string
  documentSnapshot: AiEditorDocumentSnapshot
  focusedContext: AiEditorFocusedContext
  retrievedContext: AiEditorRetrievedContext
  threadContext: AiEditorThreadContext
  memorySummary: string
}

export interface AiEditorMemoryWrite {
  scope: AiEditorMemoryScope
  kind: AiEditorMemoryKind
  title: string
  summary: string
  payload?: Record<string, unknown> | null
  confidence?: number
  pinned?: boolean
  archived?: boolean
}

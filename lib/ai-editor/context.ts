import { buildAiEditorMemorySummary } from '@/lib/ai-editor/memory'
import { retrieveRelevantBlocks, retrieveRelevantMemoryItems } from '@/lib/ai-editor/retrieval'
import type {
  AiEditorContext,
  AiEditorContextInput,
  AiEditorDocumentSnapshot,
  AiEditorFocusedContext,
  AiEditorThreadContext,
  EditorDocumentBlock,
} from '@/lib/ai-editor/types'
import { buildEditorDocumentOutline } from '@/lib/editor-document-outline'

function clipText(text: string, max = 200) {
  return text.length > max ? `${text.slice(0, max - 1)}…` : text
}

function buildDominantTopics(outline: EditorDocumentBlock[]) {
  const counts = new Map<string, number>()

  for (const block of outline) {
    const tokens = (block.text.toLowerCase().match(/[a-z0-9_-]{3,}|[\u4e00-\u9fff]{2,8}/g) || [])
      .filter((token) => token.length >= 2)
      .slice(0, 8)

    for (const token of tokens) {
      counts.set(token, (counts.get(token) || 0) + 1)
    }
  }

  return [...counts.entries()]
    .sort((left, right) => right[1] - left[1])
    .slice(0, 6)
    .map(([topic]) => topic)
}

function buildDocumentSnapshot(
  title: string,
  postSlug: string | null,
  fullText: string,
  outline: EditorDocumentBlock[],
): AiEditorDocumentSnapshot {
  const headings = outline
    .filter((block) => block.headingLevel !== null)
    .map((block) => ({
      index: block.index,
      heading: block.text || `标题 ${block.index + 1}`,
      level: block.headingLevel || 1,
    }))

  const wordCount = fullText
    ? fullText.split(/\s+/).filter(Boolean).length
    : 0

  const summarySource = outline
    .filter((block) => block.semanticRole === 'intro' || block.semanticRole === 'body')
    .slice(0, 3)
    .map((block) => block.text)
    .join(' ')

  return {
    title,
    postSlug,
    wordCount,
    articleSummary: clipText(summarySource || fullText || title, 280),
    outline: headings.slice(0, 12),
    topHeadings: headings.slice(0, 8).map((item) => item.heading),
    dominantTopics: buildDominantTopics(outline),
  }
}

function buildFocusedContext(
  outline: EditorDocumentBlock[],
  activeBlockIndex?: number | null,
  selectionText?: string | null,
): AiEditorFocusedContext {
  const activeBlock = Number.isInteger(activeBlockIndex)
    ? (outline.find((block) => block.index === Number(activeBlockIndex)) || null)
    : null
  const currentSectionBlocks = activeBlock
    ? outline.filter((block) => block.sectionIndex === activeBlock.sectionIndex).slice(0, 8)
    : outline.slice(0, 6)
  const previousBlocks = activeBlock
    ? outline.filter((block) => block.index >= activeBlock.index - 2 && block.index < activeBlock.index)
    : []
  const nextBlocks = activeBlock
    ? outline.filter((block) => block.index > activeBlock.index && block.index <= activeBlock.index + 2)
    : []

  return {
    activeBlock,
    activeHeadingPath: activeBlock?.headingPath || [],
    currentSectionTitle: activeBlock?.sectionTitle || null,
    selectionText: (selectionText || '').trim() || null,
    previousBlocks,
    nextBlocks,
    currentSectionBlocks,
  }
}

function buildThreadSummary(history: AiEditorContextInput['history']) {
  const recentMessages = (history || []).slice(-6)
  const threadSummary = recentMessages.length > 0
    ? recentMessages
      .map((item) => `${item.role === 'user' ? '用户' : 'AI'}：${clipText(item.content, 90)}`)
      .join('\n')
    : '暂无历史对话。'

  return {
    recentMessages,
    threadSummary,
  }
}

function buildThreadContext(
  history: AiEditorContextInput['history'],
  memoryItems: AiEditorContextInput['memoryItems'],
  sessionSummary?: string | null,
): AiEditorThreadContext {
  const { recentMessages, threadSummary } = buildThreadSummary(history)
  const activeItems = (memoryItems || []).filter((item) => !item.archived)

  return {
    recentMessages,
    threadSummary: (sessionSummary || '').trim() || threadSummary,
    acceptedDecisions: activeItems
      .filter((item) => item.kind === 'decision' || item.kind === 'completed_task')
      .slice(0, 3)
      .map((item) => item.summary),
    pendingTasks: activeItems
      .filter((item) => item.kind === 'open_task')
      .slice(0, 3)
      .map((item) => item.summary),
    activeImageStyle: activeItems.find((item) => item.kind === 'image_style')?.summary || null,
  }
}

export function buildAiEditorContext(input: AiEditorContextInput): AiEditorContext {
  const outline = buildEditorDocumentOutline(input.documentJson)
  const normalizedTitle = input.title.trim()
  const normalizedText = input.documentText.trim()
  const postSlug = (input.postSlug || '').trim() || null
  const focusedContext = buildFocusedContext(outline, input.activeBlockIndex, input.selectionText)
  const retrievedBlocks = retrieveRelevantBlocks({
    outline,
    userMessage: input.userMessage || '',
    activeBlockIndex: input.activeBlockIndex,
  })
  const memoryItems = input.memoryItems || []
  const retrievedMemoryItems = retrieveRelevantMemoryItems({
    memoryItems,
    userMessage: input.userMessage || '',
  })
  const summaryParts = [
    (input.userSummary || '').trim(),
    (input.articleSummary || '').trim(),
    (input.sessionSummary || '').trim(),
  ].filter(Boolean)
  const memorySummary = summaryParts.length > 0
    ? summaryParts.join('\n\n')
    : buildAiEditorMemorySummary(
        retrievedMemoryItems.length > 0 ? retrievedMemoryItems : memoryItems.slice(0, 6),
      )

  return {
    title: normalizedTitle,
    postSlug,
    fullText: normalizedText,
    outline,
    outlineText: outline
      .map((block) => {
        const preview = block.text.length > 180
          ? `${block.text.slice(0, 180)}…`
          : block.text
        const heading = block.headingPath.length > 0
          ? ` <${block.headingPath.join(' / ')}>`
          : ''
        return `#${block.index + 1} [${block.type}/${block.semanticRole}]${heading} ${preview || '(空块)'}`
      })
      .join('\n'),
    documentSnapshot: buildDocumentSnapshot(normalizedTitle, postSlug, normalizedText, outline),
    focusedContext,
    retrievedContext: {
      ...retrievedBlocks,
      memoryItems: retrievedMemoryItems,
    },
    threadContext: buildThreadContext(input.history, memoryItems, input.sessionSummary),
    memorySummary,
  }
}

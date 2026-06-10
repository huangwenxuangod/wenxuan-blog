import { describe, expect, it } from 'vitest'
import { buildAiEditorContext } from '@/lib/ai-editor/context'

describe('ai editor context', () => {
  it('builds document snapshot, focused context, retrieval, and memory summary', () => {
    const context = buildAiEditorContext({
      title: 'AI 写作系统',
      postSlug: 'ai-writing-system',
      documentText: 'AI 写作系统 总览 这一节讨论上下文与记忆。',
      documentJson: {
        type: 'doc',
        content: [
          {
            type: 'heading',
            attrs: { level: 1 },
            content: [{ type: 'text', text: '总览' }],
          },
          {
            type: 'paragraph',
            content: [{ type: 'text', text: '这一节讨论上下文与记忆设计，帮助 AI 更准确地参与编辑。' }],
          },
          {
            type: 'heading',
            attrs: { level: 2 },
            content: [{ type: 'text', text: '图片策略' }],
          },
          {
            type: 'paragraph',
            content: [{ type: 'text', text: '这里讨论插图、封面和视觉节奏。' }],
          },
        ],
      },
      userMessage: '帮我改一下上下文这一节，并保持克制风格',
      activeBlockIndex: 1,
      history: [
        { role: 'user', content: '这篇文章主要是讲编辑器 AI。' },
        { role: 'assistant', content: '明白，我会聚焦右栏 AI 协作。' },
      ],
      memoryItems: [
        {
          id: 1,
          scope: 'article',
          kind: 'style',
          title: '写作偏好',
          summary: '整体风格偏克制、少一点营销感。',
          confidence: 0.9,
          pinned: true,
          archived: false,
        },
      ],
    })

    expect(context.documentSnapshot.title).toBe('AI 写作系统')
    expect(context.focusedContext.activeBlock?.index).toBe(1)
    expect(context.focusedContext.currentSectionTitle).toBe('总览')
    expect(context.retrievedContext.relevantBlocks.length).toBeGreaterThan(0)
    expect(context.memorySummary).toContain('克制')
    expect(context.threadContext.threadSummary).toContain('用户')
  })

  it('prefers compact article summary inputs when provided', () => {
    const context = buildAiEditorContext({
      title: 'AI 写作系统',
      postSlug: 'ai-writing-system',
      documentText: 'AI 写作系统 总览 这一节讨论上下文与记忆。',
      documentJson: {
        type: 'doc',
        content: [
          {
            type: 'paragraph',
            content: [{ type: 'text', text: '这一节讨论上下文与记忆设计。' }],
          },
        ],
      },
      userMessage: '帮我继续写',
      userSummary: '用户偏好：整体语气克制、简洁。',
      articleSummary: '文章目标：解释 AI 写作系统的上下文与记忆设计。',
      sessionSummary: '最近对话：刚确认文章要更偏产品设计视角。',
      memoryItems: [],
    })

    expect(context.memorySummary).toContain('用户偏好')
    expect(context.memorySummary).toContain('文章目标')
    expect(context.threadContext.threadSummary).toContain('最近对话')
  })
})

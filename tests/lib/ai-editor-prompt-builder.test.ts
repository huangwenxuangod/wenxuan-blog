import { describe, expect, it } from 'vitest'
import { buildEditorAiModelPrompt } from '@/lib/ai-editor/prompt-builder'

describe('buildEditorAiModelPrompt', () => {
  it('injects decisions, pending tasks, visual style, and visual candidate blocks into the prompt', () => {
    const prompt = buildEditorAiModelPrompt({
      articleKey: 'post:test',
      userMessage: '给这一节补一张图，并保持之前的视觉方向',
      title: '测试文章',
      postSlug: 'test-post',
      documentText: '正文',
      history: [],
      memoryItems: [],
      context: {
        title: '测试文章',
        postSlug: 'test-post',
        fullText: '正文',
        outline: [],
        outlineText: '',
        documentSnapshot: {
          title: '测试文章',
          postSlug: 'test-post',
          wordCount: 100,
          articleSummary: '摘要',
          outline: [],
          topHeadings: [],
          dominantTopics: ['agent'],
        },
        focusedContext: {
          activeBlock: null,
          activeHeadingPath: [],
          currentSectionTitle: null,
          selectionText: null,
          previousBlocks: [],
          nextBlocks: [],
          currentSectionBlocks: [],
        },
        retrievedContext: {
          relevantBlocks: [],
          supportingBlocks: [],
          visualCandidateBlocks: [
            {
              blockId: 'b1',
              index: 6,
              type: 'paragraph',
              text: '这里适合作为插图位置，讨论 agent loop 的执行节奏。',
              charCount: 24,
              path: [6],
              headingLevel: null,
              headingPath: ['Runtime'],
              sectionIndex: 1,
              sectionTitle: 'Runtime',
              semanticRole: 'body',
              previousBlockIndex: 5,
              nextBlockIndex: 7,
              isVisualCandidate: true,
            },
          ],
          memoryItems: [],
        },
        threadContext: {
          recentMessages: [],
          threadSummary: '最近在讨论 runtime harness。',
          acceptedDecisions: ['统一使用 workspace article agent，不再保留双系统。'],
          pendingTasks: ['下一步补齐图片插入与风格延续。'],
          activeImageStyle: '偏克制的 editorial illustration，暖白底，低装饰。',
        },
        memorySummary: '文章目标：解释 runtime harness。',
      },
    })

    expect(prompt.userPrompt).toContain('已确认规则')
    expect(prompt.userPrompt).toContain('统一使用 workspace article agent')
    expect(prompt.userPrompt).toContain('当前待继续事项')
    expect(prompt.userPrompt).toContain('图片插入与风格延续')
    expect(prompt.userPrompt).toContain('当前视觉方向')
    expect(prompt.userPrompt).toContain('editorial illustration')
    expect(prompt.userPrompt).toContain('视觉候选块')
    expect(prompt.userPrompt).toContain('这里适合作为插图位置')
    expect(prompt.userPrompt).toContain('执行约束')
  })
})

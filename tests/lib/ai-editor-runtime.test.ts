import { describe, expect, it } from 'vitest'
import { convertActionToLegacyTool, normalizeToolCallToAction } from '@/lib/ai-editor/action-schema'
import { buildEditorAiTextEvents } from '@/lib/ai-editor/stream'
import { classifyEditorAiTask } from '@/lib/ai-editor/task-classifier'

describe('ai editor runtime helpers', () => {
  it('classifies rewrite and image planning tasks with editor context', () => {
    const rewriteTask = classifyEditorAiTask({
      articleKey: 'post:test',
      userMessage: '帮我把这一段润色得更克制一点',
      title: '测试文章',
      documentText: '正文',
      history: [],
      memoryItems: [],
      activeBlockIndex: 2,
      selectionText: '当前选中文本',
      context: {} as never,
    })

    const imageTask = classifyEditorAiTask({
      articleKey: 'post:test',
      userMessage: '给这篇文章规划三张配图',
      title: '测试文章',
      documentText: '正文',
      history: [],
      memoryItems: [],
      context: {} as never,
    })

    expect(rewriteTask).toBe('rewrite')
    expect(imageTask).toBe('image_plan')
  })

  it('normalizes legacy tool calls into runtime actions and back', () => {
    const action = normalizeToolCallToAction({
      name: 'rewrite_block',
      payload: {
        blockIndex: 3,
        markdown: '新的内容',
      },
    })

    expect(action).toEqual({
      type: 'rewrite_block',
      blockIndex: 3,
      markdown: '新的内容',
    })

    expect(convertActionToLegacyTool(action)).toEqual({
      name: 'rewrite_block',
      payload: {
        blockIndex: 3,
        markdown: '新的内容',
      },
    })
  })

  it('builds runtime text events with action_ready before assistant_done', () => {
    const events = buildEditorAiTextEvents({
      message: '这是给用户的解释文本',
      action: {
        type: 'append_section',
        markdown: '## 新章节',
      },
    })

    expect(events[0]).toEqual({ type: 'assistant_start' })
    expect(events.some((event) => event.type === 'assistant_delta')).toBe(true)
    expect(events.some((event) => event.type === 'action_ready')).toBe(true)
    expect(events.at(-1)).toEqual({
      type: 'assistant_done',
      message: '这是给用户的解释文本',
      action: {
        type: 'append_section',
        markdown: '## 新章节',
      },
      error: undefined,
    })
  })

  it('converts planned image action back to the legacy tool payload shape', () => {
    const tool = convertActionToLegacyTool({
      type: 'plan_article_images',
      images: [
        {
          blockIndex: 2,
          reason: '用于解释第二节',
          prompt: '一张极简插图',
          alt: '第二节插图',
          aspectRatio: '16:9',
          resolution: '2k',
        },
      ],
    })

    expect(tool).toEqual({
      name: 'plan_article_images',
      payload: {
        images: [
          {
            blockIndex: 2,
            reason: '用于解释第二节',
            prompt: '一张极简插图',
            alt: '第二节插图',
            aspectRatio: '16:9',
            resolution: '2k',
          },
        ],
      },
    })
  })
})

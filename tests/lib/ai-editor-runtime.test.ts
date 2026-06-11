import { beforeEach, describe, expect, it, vi } from 'vitest'
import { convertActionToLegacyTool, normalizeToolCallToAction } from '@/lib/ai-editor/action-schema'
import { buildEditorAiTextEvents } from '@/lib/ai-editor/stream'
import { classifyEditorAiTask } from '@/lib/ai-editor/task-classifier'

const mocks = vi.hoisted(() => ({
  planEditorAiStep: vi.fn(),
  executeListPostsTool: vi.fn(),
  executeSearchPostsTool: vi.fn(),
  executeGetPostTool: vi.fn(),
  executeCreatePostTool: vi.fn(),
  executeUpdatePostTool: vi.fn(),
}))

vi.mock('@/lib/ai-editor/provider', () => ({
  planEditorAiStep: mocks.planEditorAiStep,
}))

vi.mock('@/lib/ai-editor/workspace-tools', () => ({
  executeListPostsTool: mocks.executeListPostsTool,
  executeSearchPostsTool: mocks.executeSearchPostsTool,
  executeGetPostTool: mocks.executeGetPostTool,
  executeCreatePostTool: mocks.executeCreatePostTool,
  executeUpdatePostTool: mocks.executeUpdatePostTool,
}))

import { runEditorAiRuntime } from '@/lib/ai-editor/runtime'

describe('ai editor runtime helpers', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

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
      name: 'edit_selection',
      payload: {
        markdown: '新的内容',
        blockIndex: 3,
      },
    })

    expect(action).toEqual({
      type: 'edit_selection',
      markdown: '新的内容',
      blockIndex: 3,
    })

    expect(convertActionToLegacyTool(action)).toEqual({
      name: 'edit_selection',
      payload: {
        markdown: '新的内容',
        blockIndex: 3,
      },
    })
  })

  it('builds runtime text events with action_ready before assistant_done', () => {
    const events = buildEditorAiTextEvents({
      message: '这是给用户的解释文本',
      action: {
        type: 'insert_block',
        position: 'end',
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
        type: 'insert_block',
        position: 'end',
        markdown: '## 新章节',
      },
      error: undefined,
    })
  })

  it('converts generate_images action back to the legacy tool payload shape', () => {
    const tool = convertActionToLegacyTool({
      type: 'generate_images',
      images: [
        {
          prompt: '一张极简插图',
          usage: 'inline',
          anchorBlockIndex: 2,
          alt: '第二节插图',
          aspectRatio: '16:9',
          resolution: '2k',
        },
      ],
    })

    expect(tool).toEqual({
      name: 'generate_images',
      payload: {
        images: [
          {
            prompt: '一张极简插图',
            usage: 'inline',
            anchorBlockIndex: 2,
            alt: '第二节插图',
            aspectRatio: '16:9',
            resolution: '2k',
          },
        ],
      },
    })
  })

  it('reuses existing lookup observations instead of executing the same search twice', async () => {
    mocks.planEditorAiStep
      .mockResolvedValueOnce({
        completed: Promise.resolve({
          message: '先搜一下相关文章。',
          toolCall: {
            name: 'search_posts',
            payload: { query: 'agent' },
          },
        }),
      })
      .mockResolvedValueOnce({
        completed: Promise.resolve({
          message: '我再确认一下相同搜索。',
          toolCall: {
            name: 'search_posts',
            payload: { query: 'agent' },
          },
        }),
      })
      .mockResolvedValueOnce({
        completed: Promise.resolve({
          message: '已有结果足够，我会基于现有文章继续。',
          toolCall: {
            name: 'reply_only',
            payload: null,
          },
        }),
      })

    mocks.executeSearchPostsTool.mockResolvedValue({
      posts: [
        { slug: 'agent-post', title: 'Agent Post', excerpt: 'agent excerpt' },
      ],
    })

    const runtime = await runEditorAiRuntime({
      articleKey: 'post:test',
      userMessage: '找一下 agent 相关文章',
      title: '测试文章',
      documentText: '正文',
      history: [],
      memoryItems: [],
      db: { kind: 'db' } as never,
    })

    const events: Array<Record<string, unknown>> = []
    for await (const event of runtime.stream) {
      events.push(event as Record<string, unknown>)
    }

    expect(mocks.executeSearchPostsTool).toHaveBeenCalledTimes(1)
    expect(events.filter((event) => event.type === 'tool_pending')).toHaveLength(1)
    expect(events.filter((event) => event.type === 'tool_result')).toHaveLength(1)
    expect(runtime.completed).resolves.toMatchObject({
      action: { type: 'reply_only' },
      message: '已有结果足够，我会基于现有文章继续。',
    })
  })

  it('caps get_post calls to three per runtime loop', async () => {
    mocks.planEditorAiStep
      .mockResolvedValueOnce({
        completed: Promise.resolve({
          message: '先读第一篇。',
          toolCall: { name: 'get_post', payload: { slug: 'a' } },
        }),
      })
      .mockResolvedValueOnce({
        completed: Promise.resolve({
          message: '再读第二篇。',
          toolCall: { name: 'get_post', payload: { slug: 'b' } },
        }),
      })
      .mockResolvedValueOnce({
        completed: Promise.resolve({
          message: '再读第三篇。',
          toolCall: { name: 'get_post', payload: { slug: 'c' } },
        }),
      })
      .mockResolvedValueOnce({
        completed: Promise.resolve({
          message: '再读第四篇。',
          toolCall: { name: 'get_post', payload: { slug: 'd' } },
        }),
      })

    mocks.executeGetPostTool.mockImplementation(async (_db: unknown, payload: { slug: string }) => ({
      post: {
        slug: payload.slug,
        title: `title-${payload.slug}`,
        category: 'AI',
        description: null,
        content: `content-${payload.slug}`,
        tags: [],
        status: 'draft',
      },
    }))

    const runtime = await runEditorAiRuntime({
      articleKey: 'post:test',
      userMessage: '把这几篇文章都读一下',
      title: '测试文章',
      documentText: '正文',
      history: [],
      memoryItems: [],
      db: { kind: 'db' } as never,
    })

    for await (const _event of runtime.stream) {
      // drain
    }

    const completed = await runtime.completed

    expect(mocks.executeGetPostTool).toHaveBeenCalledTimes(3)
    expect(completed.action).toEqual({ type: 'reply_only' })
    expect(completed.message).toContain('没有收敛到安全的最终动作')
  })

  it('blocks a repeated edit_selection action that already exists in recent completed-task memory', async () => {
    mocks.planEditorAiStep
      .mockResolvedValueOnce({
        completed: Promise.resolve({
          message: '我先继续改这一段。',
          toolCall: {
            name: 'edit_selection',
            payload: {
              markdown: '新的内容',
              blockIndex: 3,
            },
          },
        }),
      })
      .mockResolvedValueOnce({
        completed: Promise.resolve({
          message: '这一段刚改过，我改为直接总结现状。',
          toolCall: {
            name: 'reply_only',
            payload: null,
          },
        }),
      })

    const runtime = await runEditorAiRuntime({
      articleKey: 'post:test',
      userMessage: '继续改这一段',
      title: '测试文章',
      documentText: '正文',
      history: [],
      memoryItems: [
        {
          id: 1,
          scope: 'article',
          kind: 'completed_task',
          title: '最近一次 AI 执行动作',
          summary: 'edit_selection: 这一段已经改好了。',
          payload: {
            toolName: 'edit_selection',
            toolPayload: {
              markdown: '新的内容',
              blockIndex: 3,
            },
          },
          confidence: 0.8,
          pinned: false,
          archived: false,
        },
      ],
      db: { kind: 'db' } as never,
    })

    const events: Array<Record<string, unknown>> = []
    for await (const event of runtime.stream) {
      events.push(event as Record<string, unknown>)
    }

    expect(events.some((event) => event.type === 'action_ready')).toBe(false)
    await expect(runtime.completed).resolves.toMatchObject({
      action: { type: 'reply_only' },
      message: '这一段刚改过，我改为直接总结现状。',
    })
  })

  it('blocks a repeated generate_images action that already exists in recent completed-task memory', async () => {
    mocks.planEditorAiStep
      .mockResolvedValueOnce({
        completed: Promise.resolve({
          message: '我再生成同一组图。',
          toolCall: {
            name: 'generate_images',
            payload: {
              images: [
                {
                  prompt: '一张暖白底的 editorial 插图',
                  usage: 'inline',
                  anchorBlockIndex: 2,
                  styleFingerprint: 'warm-editorial-soft',
                  visualRole: 'inline_explainer',
                },
              ],
            },
          },
        }),
      })
      .mockResolvedValueOnce({
        completed: Promise.resolve({
          message: '同一组图已经生成过，我改为直接复用现有结果。',
          toolCall: {
            name: 'reply_only',
            payload: null,
          },
        }),
      })

    const runtime = await runEditorAiRuntime({
      articleKey: 'post:test',
      userMessage: '再来一张一样的图',
      title: '测试文章',
      documentText: '正文',
      history: [],
      memoryItems: [
        {
          id: 2,
          scope: 'article',
          kind: 'completed_task',
          title: '最近一次 AI 执行动作',
          summary: 'generate_images: 已完成一张正文插图。',
          payload: {
            toolName: 'generate_images',
            toolPayload: {
              images: [
                {
                  prompt: '一张暖白底的 editorial 插图',
                  usage: 'inline',
                  anchorBlockIndex: 2,
                  styleFingerprint: 'warm-editorial-soft',
                  visualRole: 'inline_explainer',
                },
              ],
            },
          },
          confidence: 0.8,
          pinned: false,
          archived: false,
        },
      ],
      db: { kind: 'db' } as never,
    })

    const events: Array<Record<string, unknown>> = []
    for await (const event of runtime.stream) {
      events.push(event as Record<string, unknown>)
    }

    expect(events.some((event) => event.type === 'action_ready')).toBe(false)
    await expect(runtime.completed).resolves.toMatchObject({
      action: { type: 'reply_only' },
      message: '同一组图已经生成过，我改为直接复用现有结果。',
    })
  })

  it('blocks update_post when the target slug was neither explicit nor read in this runtime', async () => {
    mocks.planEditorAiStep
      .mockResolvedValueOnce({
        completed: Promise.resolve({
          message: '我直接改那篇文章。',
          toolCall: {
            name: 'update_post',
            payload: {
              slug: 'target-post',
              updates: {
                title: '新的标题',
              },
            },
          },
        }),
      })
      .mockResolvedValueOnce({
        completed: Promise.resolve({
          message: '目标还不明确，我先不直接修改。',
          toolCall: {
            name: 'reply_only',
            payload: null,
          },
        }),
      })

    const runtime = await runEditorAiRuntime({
      articleKey: 'post:test',
      userMessage: '帮我改那篇文章的标题',
      title: '测试文章',
      documentText: '正文',
      history: [],
      memoryItems: [],
      db: { kind: 'db' } as never,
    })

    const events: Array<Record<string, unknown>> = []
    for await (const event of runtime.stream) {
      events.push(event as Record<string, unknown>)
    }

    expect(mocks.executeUpdatePostTool).not.toHaveBeenCalled()
    expect(events.some((event) => event.type === 'tool_pending' && event.tool === 'update_post')).toBe(false)
    await expect(runtime.completed).resolves.toMatchObject({
      action: { type: 'reply_only' },
      message: '目标还不明确，我先不直接修改。',
    })
  })

  it('allows update_post when the user explicitly provides the slug in the message', async () => {
    mocks.planEditorAiStep.mockResolvedValueOnce({
      completed: Promise.resolve({
        message: '我来更新这篇文章。',
        toolCall: {
          name: 'update_post',
          payload: {
            slug: 'target-post',
            updates: {
              title: '新的标题',
            },
          },
        },
      }),
    })

    mocks.executeUpdatePostTool.mockResolvedValue({
      success: true,
      slug: 'target-post',
      title: '新的标题',
      changedFields: ['title'],
    })

    const runtime = await runEditorAiRuntime({
      articleKey: 'post:test',
      userMessage: '把 slug 为 target-post 的文章标题改成新的标题',
      title: '测试文章',
      documentText: '正文',
      history: [],
      memoryItems: [],
      db: { kind: 'db' } as never,
      appEnv: {} as never,
    })

    for await (const _event of runtime.stream) {
      // drain
    }

    await expect(runtime.completed).resolves.toMatchObject({
      action: {
        type: 'update_post',
        slug: 'target-post',
        changedFields: ['title'],
      },
    })
    expect(mocks.executeUpdatePostTool).toHaveBeenCalledTimes(1)
  })

  it('allows update_post after get_post has already resolved the target slug in the same runtime', async () => {
    mocks.planEditorAiStep
      .mockResolvedValueOnce({
        completed: Promise.resolve({
          message: '先读目标文章。',
          toolCall: {
            name: 'get_post',
            payload: { slug: 'target-post' },
          },
        }),
      })
      .mockResolvedValueOnce({
        completed: Promise.resolve({
          message: '现在可以更新了。',
          toolCall: {
            name: 'update_post',
            payload: {
              slug: 'target-post',
              updates: {
                title: '新的标题',
              },
            },
          },
        }),
      })

    mocks.executeGetPostTool.mockResolvedValue({
      post: {
        slug: 'target-post',
        title: '旧标题',
        category: 'AI',
        description: null,
        content: '正文',
        tags: [],
        status: 'draft',
      },
    })

    mocks.executeUpdatePostTool.mockResolvedValue({
      success: true,
      slug: 'target-post',
      title: '新的标题',
      changedFields: ['title'],
    })

    const runtime = await runEditorAiRuntime({
      articleKey: 'post:test',
      userMessage: '帮我改一下那篇 target 文章',
      title: '测试文章',
      documentText: '正文',
      history: [],
      memoryItems: [],
      db: { kind: 'db' } as never,
      appEnv: {} as never,
    })

    for await (const _event of runtime.stream) {
      // drain
    }

    expect(mocks.executeGetPostTool).toHaveBeenCalledTimes(1)
    expect(mocks.executeUpdatePostTool).toHaveBeenCalledTimes(1)
    await expect(runtime.completed).resolves.toMatchObject({
      action: {
        type: 'update_post',
        slug: 'target-post',
        changedFields: ['title'],
      },
    })
  })
})

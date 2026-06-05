import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  getAppCloudflareEnv: vi.fn(),
  ensureAuthenticatedRequest: vi.fn(),
  parseJsonBody: vi.fn(),
  getOrCreateAiArticleThread: vi.fn(),
  appendAiArticleMessage: vi.fn(),
  listAiArticleMessages: vi.fn(),
  listAiArticleMemoryItems: vi.fn(),
  runEditorAiRuntime: vi.fn(),
  getAiRuntimeEnv: vi.fn(),
  finalizeEditorAiCompletion: vi.fn(),
}))

vi.mock('@/lib/cloudflare', () => ({
  getAppCloudflareEnv: mocks.getAppCloudflareEnv,
}))

vi.mock('@/lib/server/route-helpers', async (importOriginal) => {
  const actual = await importOriginal() as Record<string, unknown>
  return {
    ...actual,
    ensureAuthenticatedRequest: mocks.ensureAuthenticatedRequest,
    jsonError: (message: string, status = 500) => Response.json({ error: message }, { status }),
    parseJsonBody: mocks.parseJsonBody,
    withRouteErrorHandling: (handler: (req: unknown, ctx: unknown) => unknown) => handler,
  }
})

vi.mock('@/lib/repositories/ai-article-threads', () => ({
  normalizeArticleKey: (articleKey?: string, postSlug?: string) => articleKey || `post:${postSlug || 'untitled'}`,
  getOrCreateAiArticleThread: mocks.getOrCreateAiArticleThread,
  appendAiArticleMessage: mocks.appendAiArticleMessage,
  listAiArticleMessages: mocks.listAiArticleMessages,
}))

vi.mock('@/lib/repositories/ai-article-memory', () => ({
  listAiArticleMemoryItems: mocks.listAiArticleMemoryItems,
}))

vi.mock('@/lib/ai-editor/runtime', () => ({
  runEditorAiRuntime: mocks.runEditorAiRuntime,
}))

vi.mock('@/lib/ai', () => ({
  getAiRuntimeEnv: mocks.getAiRuntimeEnv,
}))

vi.mock('@/lib/ai-editor/server-execution', async () => {
  const actual = await vi.importActual<typeof import('@/lib/ai-editor/server-execution')>('@/lib/ai-editor/server-execution')
  return {
    ...actual,
    finalizeEditorAiCompletion: mocks.finalizeEditorAiCompletion,
  }
})

import { POST } from '@/app/api/editor/ai-chat/route'

describe('/api/editor/ai-chat route', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.getAppCloudflareEnv.mockResolvedValue({
      DB: { kind: 'db' },
      IMAGES: { kind: 'images' },
    })
    mocks.ensureAuthenticatedRequest.mockResolvedValue(null)
    mocks.parseJsonBody.mockResolvedValue({
      articleKey: 'post:test',
      postSlug: 'test',
      title: '测试文章',
      message: '给这篇文章规划两张配图',
      documentText: '正文',
      documentJson: { type: 'doc', content: [] },
      activeBlockIndex: 2,
      selectionText: '',
    })
    mocks.getOrCreateAiArticleThread.mockResolvedValue({ id: 42 })
    mocks.appendAiArticleMessage.mockResolvedValue(undefined)
    mocks.listAiArticleMessages.mockResolvedValue([])
    mocks.listAiArticleMemoryItems.mockResolvedValue([])
    mocks.getAiRuntimeEnv.mockReturnValue({ OPENAI_API_KEY: 'sk-test' })
    mocks.finalizeEditorAiCompletion.mockResolvedValue({
      message: '已经为你补上一张插图。',
      action: {
        type: 'generate_image',
        prompt: '图 1',
        usage: 'inline',
        anchorBlockIndex: 1,
        alt: '图一',
      },
      tool: {
        name: 'generate_image',
        payload: {
          prompt: '图 1',
          usage: 'inline',
          anchorBlockIndex: 1,
          alt: '图一',
          generatedImage: { url: '/1.webp', alt: '图一' },
        },
      },
      generatedImage: {
        url: '/1.webp',
        alt: '图一',
        usage: 'inline',
        anchorBlockIndex: 1,
      },
    })
  })

  it('streams image generation progress events and final tool payload', async () => {
    mocks.runEditorAiRuntime.mockResolvedValue({
      taskType: 'image_generate',
      context: { title: '测试文章' },
      stream: (async function* () {
        yield { type: 'assistant_start' as const }
        yield { type: 'assistant_delta' as const, delta: '正在为文章生成插图' }
        yield {
          type: 'action_ready' as const,
          action: {
            type: 'generate_image' as const,
            prompt: '图 1',
            usage: 'inline' as const,
            anchorBlockIndex: 1,
            alt: '图一',
          },
        }
        yield {
          type: 'assistant_done' as const,
          message: '原始结束消息',
          action: {
            type: 'generate_image' as const,
            prompt: '图 1',
            usage: 'inline' as const,
            anchorBlockIndex: 1,
            alt: '图一',
          },
        }
      })(),
      completed: Promise.resolve({
        message: '已经为你补上一张插图。',
        action: {
          type: 'generate_image',
          prompt: '图 1',
          usage: 'inline',
          anchorBlockIndex: 1,
          alt: '图一',
        },
        memoryCandidates: [],
      }),
    })

    const response = await POST({} as never, {} as never) as Response
    expect(response.status).toBe(200)
    expect(response.body).toBeTruthy()

    const text = await response.text()
    const events = text
      .trim()
      .split('\n')
      .map((line: string) => JSON.parse(line) as Record<string, unknown>)

    expect(events.map((event: Record<string, unknown>) => event.type)).toEqual([
      'assistant_start',
      'assistant_delta',
      'tool_pending',
      'action_ready',
      'tool_result',
      'assistant_done',
    ])

    expect(events[2]).toEqual({
      type: 'tool_pending',
      tool: 'generate_image',
      payload: { usage: 'inline' },
    })

    expect(events[4]).toEqual({
      type: 'tool_result',
      tool: 'generate_image',
      payload: {
        generatedImage: {
          url: '/1.webp',
          alt: '图一',
          usage: 'inline',
          anchorBlockIndex: 1,
        },
      },
    })

    expect(events[5]).toEqual({
      type: 'assistant_done',
      message: '已经为你补上一张插图。',
      action: {
        type: 'generate_image',
        prompt: '图 1',
        usage: 'inline',
        anchorBlockIndex: 1,
        alt: '图一',
      },
      tool: {
        name: 'generate_image',
        payload: {
          prompt: '图 1',
          usage: 'inline',
          anchorBlockIndex: 1,
          alt: '图一',
          generatedImage: { url: '/1.webp', alt: '图一' },
        },
      },
    })
  })

  it('ignores malformed memory payload rows instead of failing the whole request', async () => {
    mocks.listAiArticleMemoryItems.mockResolvedValue([
      {
        id: 7,
        article_key: 'post:test',
        scope: 'article',
        kind: 'fact',
        title: '坏数据',
        summary: '一条旧格式记录',
        payload_json: '{bad json',
        source_message_id: null,
        source_tool_name: null,
        confidence: 0.6,
        pinned: 0,
        archived: 0,
        created_at: 1,
        updated_at: 1,
      },
    ])

    mocks.runEditorAiRuntime.mockResolvedValue({
      taskType: 'chat',
      context: { title: '测试文章' },
      stream: (async function* () {
        yield { type: 'assistant_start' as const }
        yield { type: 'assistant_done' as const, message: 'ok', action: { type: 'reply_only' as const } }
      })(),
      completed: Promise.resolve({
        message: 'ok',
        action: { type: 'reply_only' as const },
        memoryCandidates: [],
      }),
    })

    const response = await POST({} as never, {} as never) as Response
    expect(response.status).toBe(200)
    expect(mocks.runEditorAiRuntime).toHaveBeenCalledWith(expect.objectContaining({
      memoryItems: [
        expect.objectContaining({
          payload: null,
        }),
      ],
    }))
  })
})

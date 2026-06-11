import { describe, expect, it } from 'vitest'
import { runAiEditorAgent } from '@/lib/ai-editor/agent'

describe('runAiEditorAgent', () => {
  it('uses json_schema response format for Workers AI structured output', async () => {
    let capturedPayload: Record<string, unknown> | null = null
    const binding = {
      run: async (_model: string, payload: Record<string, unknown>) => {
        capturedPayload = payload
        return JSON.stringify({
          message: '已为你分析当前段落。',
          tool: {
            name: 'reply_only',
            payload: null,
          },
        })
      },
    } as unknown as WorkersAIBinding

    const result = await runAiEditorAgent({
      userMessage: '帮我看看这一段有没有问题',
      history: [],
      context: {
        title: '测试文章',
        documentSnapshot: { wordCount: 12 },
        memorySummary: '',
        threadContext: {
          threadSummary: '',
          acceptedDecisions: [],
          pendingTasks: [],
          activeImageStyle: null,
        },
        focusedContext: {
          previousBlocks: [],
          activeBlock: null,
          nextBlocks: [],
          activeHeadingPath: [],
          currentSectionTitle: null,
          selectionText: null,
          currentSectionBlocks: [],
        },
        retrievedContext: {
          relevantBlocks: [],
          supportingBlocks: [],
          visualCandidateBlocks: [],
          memoryItems: [],
        },
        outlineText: '',
        fullText: '一段测试正文',
        outline: [],
      } as never,
      env: {
        WORKERS_AI: binding,
        WORKERS_AI_MODEL: '@cf/meta/llama-3.1-8b-instruct',
        ENABLE_WORKERS_AI: 'true',
      },
    })

    expect(result).toEqual({
      message: '已为你分析当前段落。',
      tool: {
        name: 'reply_only',
        payload: null,
      },
    })

    expect(capturedPayload).toMatchObject({
      response_format: {
        type: 'json_schema',
        json_schema: {
          type: 'object',
          required: ['message', 'tool'],
        },
      },
    })
  })
})

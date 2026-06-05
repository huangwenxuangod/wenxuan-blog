import { describe, expect, it } from 'vitest'
import { buildEditorAiRouteEvents } from '@/lib/ai-editor/server-execution'

describe('ai editor server execution', () => {
  it('emits assistant_error when completion fails after assistant_done', async () => {
    const events = []

    for await (const event of buildEditorAiRouteEvents(
      (async function* () {
        yield { type: 'assistant_start' as const }
        yield {
          type: 'assistant_done' as const,
          message: 'partial',
          action: { type: 'reply_only' as const },
        }
      })(),
      Promise.reject(new Error('图片生成失败')),
    )) {
      events.push(event)
    }

    expect(events).toEqual([
      { type: 'assistant_start' },
      { type: 'assistant_error', error: '图片生成失败' },
    ])
  })
})

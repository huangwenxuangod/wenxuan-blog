import { describe, expect, it } from 'vitest'
import { parseStructuredEditorToolCall } from '@/lib/ai-editor/providers/structured-tool'
import { normalizeAiEditorToolCall } from '@/lib/ai-editor/tool-registry'

describe('parseStructuredEditorToolCall', () => {
  it('parses the current structured { message, tool } shape', () => {
    expect(parseStructuredEditorToolCall(JSON.stringify({
      message: '你好，我来帮你改这一段。',
      tool: {
        name: 'reply_only',
        payload: null,
      },
    }))).toEqual({
      message: '你好，我来帮你改这一段。',
      toolName: 'reply_only',
      toolPayload: null,
      parsed: true,
    })
  })

  it('keeps compatibility with legacy { name, payload } shape', () => {
    expect(parseStructuredEditorToolCall(JSON.stringify({
      name: 'edit_title',
      payload: {
        title: '新的标题',
      },
    }))).toEqual({
      message: '',
      toolName: 'edit_title',
      toolPayload: {
        title: '新的标题',
      },
      parsed: true,
    })
  })

  it('marks plain-text fallbacks as unparsed so callers can fail loudly', () => {
    expect(parseStructuredEditorToolCall('普通文本回复')).toEqual({
      message: '普通文本回复',
      toolName: 'reply_only',
      toolPayload: null,
      parsed: false,
    })
  })

  it('downgrades unsupported tool names to reply_only during normalization', () => {
    expect(normalizeAiEditorToolCall({
      name: 'delete_everything',
      payload: { now: true },
    })).toEqual({
      name: 'reply_only',
      payload: null,
    })
  })
})

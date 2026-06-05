import { describe, expect, it } from 'vitest'
import {
  buildDocumentContextText,
  createHistoryStorageKey,
  extractTitleCandidate,
  readAiTextResponse,
  TITLE_GENERATION_PROMPT,
} from '@/lib/ai-modal'

describe('ai-modal helpers', () => {
  it('builds document context text and truncates very long document bodies', () => {
    const context = buildDocumentContextText('Ask AI 标题', `${'正文片段'.repeat(3001)}`)

    expect(context).toContain('标题：Ask AI 标题')
    expect(context).toContain('[正文过长，以下内容已截断]')
    expect(context.length).toBeLessThan(12200)
  })

  it('creates a stable history storage key with fallback scope', () => {
    expect(createHistoryStorageKey('inline-article')).toBe('qmblog:ask-ai-history:inline-article')
    expect(createHistoryStorageKey('')).toBe('qmblog:ask-ai-history:default')
  })

  it('extracts a clean title candidate from markdown output', () => {
    expect(extractTitleCandidate('1. **更好的标题**\n\n第二行说明')).toBe('更好的标题')
    expect(extractTitleCandidate('## 新标题提案')).toBe('新标题提案')
  })

  it('requests exactly one plain title', () => {
    expect(TITLE_GENERATION_PROMPT).toContain('生成 1 个')
    expect(TITLE_GENERATION_PROMPT).toContain('只返回标题本身')
    expect(TITLE_GENERATION_PROMPT).not.toContain('5 个')
  })

  it('reads the streaming AI response as plain text instead of JSON', async () => {
    const response = new Response('Claude 动态工作流终极指南')

    await expect(readAiTextResponse(response)).resolves.toBe('Claude 动态工作流终极指南')
  })
})

import { describe, expect, it } from 'vitest'
import { StreamingJsonMessageExtractor } from '@/lib/ai-editor/providers/streaming-json-message'

describe('StreamingJsonMessageExtractor', () => {
  it('streams only the message field across multiple chunks', () => {
    const extractor = new StreamingJsonMessageExtractor()
    const chunks = [
      '{"message":"正在',
      '读取文章',
      '，然后继续","tool":{"name":"search_posts","payload":{"query":"agent"}}}',
    ]

    const output = chunks.map((chunk) => extractor.feed(chunk)).join('')

    expect(output).toBe('正在读取文章，然后继续')
  })

  it('decodes escaped characters and unicode while streaming', () => {
    const extractor = new StreamingJsonMessageExtractor()
    const chunks = [
      '{"message":"第一行\\n第',
      '二行 \\u4f60\\u597d',
      '\\" world","tool":{"name":"reply_only","payload":null}}',
    ]

    const output = chunks.map((chunk) => extractor.feed(chunk)).join('')

    expect(output).toBe('第一行\n第二行 你好" world')
  })
})

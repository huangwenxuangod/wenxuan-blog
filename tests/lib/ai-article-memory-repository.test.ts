import { describe, expect, it } from 'vitest'
import { inferMemoryTopicFamily } from '@/lib/repositories/ai-article-memory'

describe('ai article memory repository helpers', () => {
  it('classifies image-related memories into the image family', () => {
    expect(inferMemoryTopicFamily({
      summary: '已完成 2 张图片任务，正文插图 1 张，封面 1 张。',
      sourceToolName: 'generate_images',
      payload: {
        styleFingerprints: ['warm-editorial-soft'],
      },
    })).toBe('image')
  })

  it('classifies title and content editing memories separately', () => {
    expect(inferMemoryTopicFamily({
      summary: 'edit_title: 已更新文章标题为《新的标题》',
      sourceToolName: 'edit_title',
    })).toBe('title')

    expect(inferMemoryTopicFamily({
      summary: 'edit_selection: 已改写第二节正文并补了一个例子。',
      sourceToolName: 'edit_selection',
    })).toBe('content')
  })

  it('falls back to generic when no strong topic signal exists', () => {
    expect(inferMemoryTopicFamily({
      summary: '下次继续处理这个问题。',
      sourceToolName: null,
      payload: null,
    })).toBe('generic')
  })
})

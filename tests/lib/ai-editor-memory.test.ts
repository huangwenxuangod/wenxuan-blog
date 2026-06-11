import { describe, expect, it } from 'vitest'
import { deriveAiEditorMemoryCandidates } from '@/lib/ai-editor/memory'

describe('deriveAiEditorMemoryCandidates', () => {
  it('derives image execution memory even when there is no user message', () => {
    const candidates = deriveAiEditorMemoryCandidates({
      userMessage: '',
      assistantMessage: '已完成 2 张图片任务，成功 2 张，正文插图 1 张，封面 1 张。',
      tool: {
        name: 'generate_images',
        payload: {
          images: [
            {
              prompt: '封面图',
              usage: 'cover',
              visualRole: 'cover',
              styleFingerprint: 'warm-editorial-soft',
              generationReason: '用于文章封面',
            },
          ],
          execution: {
            count: 2,
            completedCount: 2,
            failedCount: 0,
            coverCount: 1,
            inlineCount: 1,
            results: [
              {
                visualRole: 'cover',
                styleFingerprint: 'warm-editorial-soft',
                generationReason: '用于文章封面',
              },
            ],
          },
        },
      },
    })

    expect(candidates.some((item) => item.kind === 'completed_task')).toBe(true)
    expect(candidates.some((item) => item.kind === 'image_style')).toBe(true)
    expect(candidates.find((item) => item.kind === 'image_style')?.summary).toContain('warm-editorial-soft')
  })
})

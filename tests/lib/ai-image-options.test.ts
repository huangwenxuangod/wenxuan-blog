import { describe, expect, it } from 'vitest'
import {
  buildAspectRatioPromptHint,
  getAiImageAspectRatioLabel,
  normalizeAiImageAspectRatio,
} from '@/lib/ai-image/options'

describe('ai-image options', () => {
  it('supports the 5:2 aspect ratio option', () => {
    expect(normalizeAiImageAspectRatio('5:2')).toBe('5:2')
    expect(getAiImageAspectRatioLabel('5:2')).toBe('5:2')
  })

  it('builds a dedicated prompt hint for 5:2 cover banners', () => {
    expect(buildAspectRatioPromptHint('5:2')).toContain('5:2')
    expect(buildAspectRatioPromptHint('5:2')).toContain('博客头图')
  })
})

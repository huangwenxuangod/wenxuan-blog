import { describe, expect, it } from 'vitest'
import { buildEditorDocumentOutline } from '@/lib/editor-document-outline'

describe('editor document outline', () => {
  it('builds heading path and section metadata', () => {
    const outline = buildEditorDocumentOutline({
      type: 'doc',
      content: [
        {
          type: 'heading',
          attrs: { level: 1 },
          content: [{ type: 'text', text: '总标题' }],
        },
        {
          type: 'paragraph',
          content: [{ type: 'text', text: '这是开头段落。' }],
        },
        {
          type: 'heading',
          attrs: { level: 2 },
          content: [{ type: 'text', text: '第二节' }],
        },
        {
          type: 'paragraph',
          content: [{ type: 'text', text: '这里是第二节正文内容，长度足够用于判断。' }],
        },
      ],
    })

    expect(outline).toHaveLength(4)
    expect(outline[0]?.headingLevel).toBe(1)
    expect(outline[0]?.headingPath).toEqual(['总标题'])
    expect(outline[1]?.sectionTitle).toBe('总标题')
    expect(outline[1]?.semanticRole).toBe('intro')
    expect(outline[2]?.headingPath).toEqual(['总标题', '第二节'])
    expect(outline[3]?.sectionTitle).toBe('第二节')
    expect(outline[3]?.sectionIndex).toBe(outline[2]?.sectionIndex)
  })

  it('filters visual candidates by type and text length', () => {
    const outline = buildEditorDocumentOutline({
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [{ type: 'text', text: '短句' }],
        },
        {
          type: 'paragraph',
          content: [{ type: 'text', text: '这是一个足够长的段落内容，用来验证视觉候选块的启发式判断是否生效。' }],
        },
      ],
    })

    expect(outline[0]?.isVisualCandidate).toBe(false)
    expect(outline[1]?.isVisualCandidate).toBe(true)
  })
})

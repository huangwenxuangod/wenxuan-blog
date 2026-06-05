import { describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  insertGeneratedImageAtPosition: vi.fn(),
  replaceEditorRangeWithMarkdown: vi.fn(),
}))

vi.mock('@/lib/editor-file-upload', () => ({
  insertGeneratedImageAtPosition: mocks.insertGeneratedImageAtPosition,
}))

vi.mock('@/lib/editor-markdown', () => ({
  replaceEditorRangeWithMarkdown: mocks.replaceEditorRangeWithMarkdown,
}))

import {
  applyEditorAiAction,
  applyLegacyToolResult,
  getActiveBlockIndex,
} from '@/lib/ai-editor/client-execution'

function createMockEditor() {
  const blocks = [
    { nodeSize: 6, isBlock: true },
    { nodeSize: 8, isBlock: true },
    { nodeSize: 10, isBlock: true },
  ]
  const blockPositions = [1, 7, 15]

  return {
    state: {
      selection: { from: 8, to: 8 },
      doc: {
        content: { size: 24 },
        descendants(callback: (node: { isBlock: boolean; nodeSize: number }, pos: number) => boolean | void) {
          for (let index = 0; index < blocks.length; index += 1) {
            const result = callback(blocks[index], blockPositions[index])
            if (result === false) {
              break
            }
          }
        },
      },
    },
  }
}

describe('ai editor client execution', () => {
  it('resolves the active block index from the current selection', () => {
    const editor = createMockEditor()

    expect(getActiveBlockIndex(editor as never)).toBe(1)
  })

  it('applies rewrite_block actions through markdown replacement', () => {
    const editor = createMockEditor()

    applyEditorAiAction(editor as never, {
      type: 'rewrite_block',
      blockIndex: 1,
      markdown: '新的中间段落',
    })

    expect(mocks.replaceEditorRangeWithMarkdown).toHaveBeenCalledWith(
      editor,
      '新的中间段落',
      { from: 7, to: 15 },
    )
  })

  it('applies rewrite_selection actions to the current selection range', () => {
    const editor = createMockEditor()

    applyEditorAiAction(editor as never, {
      type: 'rewrite_selection',
      markdown: '替换选中的内容',
    })

    expect(mocks.replaceEditorRangeWithMarkdown).toHaveBeenCalledWith(
      editor,
      '替换选中的内容',
    )
  })

  it('applies append_section tools at the document tail', () => {
    const editor = createMockEditor()

    applyLegacyToolResult(editor as never, {
      name: 'append_section',
      payload: {
        markdown: '## 新章节',
      },
    })

    expect(mocks.replaceEditorRangeWithMarkdown).toHaveBeenCalledWith(
      editor,
      '## 新章节',
      { from: 24, to: 24 },
    )
  })

  it('inserts generated images after the target block in descending order', () => {
    const editor = createMockEditor()

    applyLegacyToolResult(editor as never, {
      name: 'plan_article_images',
      payload: {
        generatedImages: [
          {
            blockIndex: 0,
            reason: 'opening visual',
            alt: '首图',
            image: { url: '/a.webp', alt: 'A' },
          },
          {
            blockIndex: 2,
            reason: 'closing visual',
            alt: '尾图',
            image: { url: '/c.webp', alt: 'C' },
          },
        ],
      },
    })

    expect(mocks.insertGeneratedImageAtPosition).toHaveBeenNthCalledWith(
      1,
      editor,
      '/c.webp',
      '尾图',
      25,
    )
    expect(mocks.insertGeneratedImageAtPosition).toHaveBeenNthCalledWith(
      2,
      editor,
      '/a.webp',
      '首图',
      7,
    )
  })
})

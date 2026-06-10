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

  it('applies edit_selection actions through block replacement when blockIndex exists', () => {
    const editor = createMockEditor()

    applyEditorAiAction(editor as never, {
      type: 'edit_selection',
      markdown: '新的中间段落',
      blockIndex: 1,
    })

    expect(mocks.replaceEditorRangeWithMarkdown).toHaveBeenCalledWith(
      editor,
      '新的中间段落',
      { from: 7, to: 15 },
    )
  })

  it('applies edit_selection actions to the current selection range', () => {
    const editor = createMockEditor()

    applyEditorAiAction(editor as never, {
      type: 'edit_selection',
      markdown: '替换选中的内容',
    })

    expect(mocks.replaceEditorRangeWithMarkdown).toHaveBeenCalledWith(
      editor,
      '替换选中的内容',
    )
  })

  it('applies insert_block tools at the document tail', () => {
    const editor = createMockEditor()

    applyLegacyToolResult(editor as never, {
      name: 'insert_block',
      payload: {
        position: 'end',
        markdown: '## 新章节',
      },
    })

    expect(mocks.replaceEditorRangeWithMarkdown).toHaveBeenCalledWith(
      editor,
      '## 新章节',
      { from: 24, to: 24 },
    )
  })

  it('inserts generated inline images after the target block', () => {
    const editor = createMockEditor()

    applyLegacyToolResult(editor as never, {
      name: 'generate_images',
      payload: {
        images: [
          {
            prompt: 'closing visual',
            usage: 'inline',
            anchorBlockIndex: 2,
            alt: '尾图',
          },
        ],
        generatedImages: [
          {
            prompt: 'closing visual',
            usage: 'inline',
            anchorBlockIndex: 2,
            alt: '尾图',
            image: { url: '/c.webp', alt: 'C' },
          },
        ],
      },
    })

    expect(mocks.insertGeneratedImageAtPosition).toHaveBeenCalledWith(
      editor,
      '/c.webp',
      '尾图',
      25,
    )
  })

  it('does not insert cover-mode generated images into the editor body', () => {
    const editor = createMockEditor()

    applyLegacyToolResult(editor as never, {
      name: 'generate_images',
      payload: {
        images: [
          {
            prompt: 'cover visual',
            usage: 'cover',
            alt: '封面图',
          },
        ],
        generatedImages: [
          {
            prompt: 'cover visual',
            usage: 'cover',
            alt: '封面图',
            image: { url: '/cover.webp', alt: '封面图' },
          },
        ],
      },
    })

    expect(mocks.insertGeneratedImageAtPosition).not.toHaveBeenCalled()
    expect(mocks.replaceEditorRangeWithMarkdown).not.toHaveBeenCalled()
  })
})

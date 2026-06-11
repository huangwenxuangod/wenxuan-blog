'use client'

import type { EditorInstance } from 'novel'
import { convertActionToLegacyTool, type LegacyEditorAiTool } from '@/lib/ai-editor/action-schema'
import type { EditorAiAction } from '@/lib/ai-editor/runtime-types'
import { insertGeneratedImageAtPosition } from '@/lib/editor-file-upload'
import { replaceEditorRangeWithMarkdown } from '@/lib/editor-markdown'

function findBlockRange(editor: EditorInstance, blockIndex: number) {
  let currentIndex = -1
  let range: { from: number; to: number } | null = null

  editor.state.doc.descendants((node, pos) => {
    if (!node.isBlock) return true
    currentIndex += 1
    if (currentIndex !== blockIndex) return true
    range = {
      from: pos,
      to: pos + node.nodeSize,
    }
    return false
  })

  return range
}

function findInsertPosition(editor: EditorInstance, blockIndex: number, position: 'before' | 'after' = 'after') {
  let currentIndex = -1
  let insertPos: number | null = null

  editor.state.doc.descendants((node, pos) => {
    if (!node.isBlock) return true
    currentIndex += 1
    if (currentIndex !== blockIndex) return true
    insertPos = position === 'before'
      ? pos
      : pos + node.nodeSize
    return false
  })

  return insertPos
}

export function getInsertPositionForBlock(editor: EditorInstance, blockIndex: number, position: 'before' | 'after' = 'after') {
  return findInsertPosition(editor, blockIndex, position)
}

export function getActiveBlockIndex(editor: EditorInstance) {
  const anchor = editor.state.selection.from
  let currentIndex = -1
  let matchedIndex: number | null = null

  editor.state.doc.descendants((node, pos) => {
    if (!node.isBlock) return true
    currentIndex += 1
    if (anchor >= pos && anchor <= pos + node.nodeSize) {
      matchedIndex = currentIndex
      return false
    }
    return true
  })

  return matchedIndex
}

export function applyLegacyToolResult(editor: EditorInstance, tool: LegacyEditorAiTool) {
  if (tool.name === 'reply_only') return

  if (tool.name === 'create_post' || tool.name === 'update_post') {
    return
  }

  if (tool.name === 'edit_title') {
    return
  }

  if (tool.name === 'edit_selection') {
    if (typeof tool.payload.blockIndex === 'number') {
      const range = findBlockRange(editor, tool.payload.blockIndex)
      if (!range) return
      replaceEditorRangeWithMarkdown(editor, tool.payload.markdown, range)
      return
    }

    replaceEditorRangeWithMarkdown(editor, tool.payload.markdown)
    return
  }

  if (tool.name === 'insert_block') {
    const position = tool.payload.position || 'end'
    const insertPos = position === 'end'
      ? editor.state.doc.content.size
      : Number.isFinite(tool.payload.anchorBlockIndex)
        ? findInsertPosition(editor, Number(tool.payload.anchorBlockIndex), position)
        : editor.state.selection.to

    replaceEditorRangeWithMarkdown(editor, tool.payload.markdown, {
      from: insertPos ?? editor.state.selection.to,
      to: insertPos ?? editor.state.selection.to,
    })
    return
  }

  if (tool.name === 'generate_images') {
    const generatedImages = tool.payload.generatedImages || []
    generatedImages
      .slice()
      .sort((a, b) => {
        const aIndex = Number.isFinite(a.anchorBlockIndex) ? Number(a.anchorBlockIndex) : Number.MAX_SAFE_INTEGER
        const bIndex = Number.isFinite(b.anchorBlockIndex) ? Number(b.anchorBlockIndex) : Number.MAX_SAFE_INTEGER
        return bIndex - aIndex
      })
      .forEach((item) => {
        if (item.usage === 'cover') {
          return
        }

        const insertPos = Number.isFinite(item.anchorBlockIndex)
          ? findInsertPosition(editor, Number(item.anchorBlockIndex), 'after')
          : editor.state.selection.to

        insertGeneratedImageAtPosition(
          editor,
          item.image.url,
          item.alt || item.image.alt,
          insertPos,
        )
      })
    return
  }

  // Legacy compatibility
  if (tool.name === 'rewrite_selection') {
    replaceEditorRangeWithMarkdown(editor, tool.payload.markdown)
    return
  }

  if (tool.name === 'append_section') {
    const end = editor.state.doc.content.size
    replaceEditorRangeWithMarkdown(editor, tool.payload.markdown, { from: end, to: end })
    return
  }

  if (tool.name === 'rewrite_block') {
    const range = findBlockRange(editor, tool.payload.blockIndex)
    if (!range) return
    replaceEditorRangeWithMarkdown(editor, tool.payload.markdown, range)
    return
  }

  if (tool.name === 'insert_text') {
    const insertPos = Number.isFinite(tool.payload.blockIndex)
      ? findInsertPosition(editor, Number(tool.payload.blockIndex), tool.payload.position || 'after')
      : editor.state.selection.to

    replaceEditorRangeWithMarkdown(editor, tool.payload.markdown, {
      from: insertPos ?? editor.state.selection.to,
      to: insertPos ?? editor.state.selection.to,
    })
    return
  }

  const generatedImages = tool.payload.generatedImages || []
  generatedImages
    .slice()
    .sort((a, b) => b.blockIndex - a.blockIndex)
    .forEach((item) => {
      const insertPos = findInsertPosition(editor, item.blockIndex, 'after')
      insertGeneratedImageAtPosition(
        editor,
        item.image.url,
        item.alt || item.image.alt,
        insertPos,
      )
    })
}

export function applyEditorAiAction(editor: EditorInstance, action: EditorAiAction) {
  applyLegacyToolResult(editor, convertActionToLegacyTool(action))
}

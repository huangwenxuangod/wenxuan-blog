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

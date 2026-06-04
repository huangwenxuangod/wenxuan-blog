'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Loader2, RefreshCw, Send, Sparkles } from 'lucide-react'
import type { EditorInstance, JSONContent } from 'novel'
import { useToast } from '@/components/Toast'
import { insertGeneratedImageAtPosition } from '@/lib/editor-file-upload'
import { replaceEditorRangeWithMarkdown } from '@/lib/editor-markdown'

type ChatMessage = {
  id: string
  role: 'user' | 'assistant'
  content: string
}

type ToolResult =
  | {
      name: 'reply_only'
      payload: null
    }
  | {
      name: 'insert_text'
      payload: {
        blockIndex?: number
        position?: 'before' | 'after'
        markdown: string
      }
    }
  | {
      name: 'rewrite_block'
      payload: {
        blockIndex: number
        markdown: string
      }
    }
  | {
      name: 'append_section'
      payload: {
        markdown: string
      }
    }
  | {
      name: 'plan_article_images'
      payload: {
        generatedImages?: Array<{
          blockIndex: number
          reason: string
          alt: string
          image: {
            url: string
            alt: string
          }
        }>
      }
    }

interface AIPanelProps {
  articleKey: string
  postSlug: string | null
  title: string
  editor: EditorInstance | null
  documentJson: JSONContent | null
  documentText: string
  onTitleApply?: (nextTitle: string) => void
}

function createMessageId(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

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

export function AIPanel({
  articleKey,
  postSlug,
  title,
  editor,
  documentJson,
  documentText,
}: AIPanelProps) {
  const toast = useToast()
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [hydrated, setHydrated] = useState(false)
  const [streamingId, setStreamingId] = useState<string | null>(null)
  const listRef = useRef<HTMLDivElement | null>(null)
  const textareaRef = useRef<HTMLTextAreaElement | null>(null)

  const suggestedPrompts = useMemo(() => ([
    '帮我润色这段文章的开头',
    '给这篇文章补一个更有力的结尾',
    '为这篇文章自动配图',
  ]), [])

  const loadHistory = useCallback(async () => {
    try {
      const search = new URLSearchParams({
        articleKey,
        ...(postSlug ? { postSlug } : {}),
        ...(title.trim() ? { title: title.trim() } : {}),
      })

      const response = await fetch(`/api/editor/ai-chat/history?${search.toString()}`, {
        credentials: 'include',
      })
      const data = await response.json().catch(() => ({})) as {
        messages?: Array<{
          id: number
          role: 'user' | 'assistant' | 'tool'
          content: string
        }>
      }

      if (!response.ok) {
        throw new Error('读取 AI 会话失败')
      }

      const nextMessages = (data.messages || [])
        .filter((item) => item.role === 'user' || item.role === 'assistant')
        .map((item) => ({
          id: `db-${item.id}`,
          role: item.role,
          content: item.content,
        }))

      setMessages(nextMessages)
      setHydrated(true)
    } catch (error) {
      setHydrated(true)
      toast.error(error instanceof Error ? error.message : '读取 AI 会话失败')
    }
  }, [articleKey, postSlug, title, toast])

  useEffect(() => {
    void loadHistory()
  }, [loadHistory])

  useEffect(() => {
    const node = listRef.current
    if (!node) return
    node.scrollTop = node.scrollHeight
  }, [messages, loading])

  const applyToolResult = useCallback((tool: ToolResult) => {
    if (!editor) return

    if (tool.name === 'reply_only') return

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

    if (tool.name === 'plan_article_images') {
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
  }, [editor])

  const resetThread = useCallback(async () => {
    try {
      const response = await fetch('/api/editor/ai-chat/reset', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          articleKey,
          postSlug,
        }),
      })

      if (!response.ok) {
        throw new Error('清空会话失败')
      }

      setMessages([])
      toast.success('已清空当前文章会话')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '清空会话失败')
    }
  }, [articleKey, postSlug, toast])

  const sendMessage = useCallback(async (rawInput?: string) => {
    const nextInput = (rawInput ?? input).trim()
    if (!nextInput || loading || !editor) return

    const userMessage: ChatMessage = {
      id: createMessageId('user'),
      role: 'user',
      content: nextInput,
    }
    const assistantId = createMessageId('assistant')

    setMessages((current) => [
      ...current,
      userMessage,
      {
        id: assistantId,
        role: 'assistant',
        content: '',
      },
    ])
    setStreamingId(assistantId)
    setInput('')
    setLoading(true)

    try {
      const response = await fetch('/api/editor/ai-chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          articleKey,
          postSlug,
          title,
          message: nextInput,
          documentText,
          documentJson,
        }),
      })

      if (!response.ok || !response.body) {
        throw new Error('AI 对话失败')
      }

      const reader = response.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''
      let finalTool: ToolResult = { name: 'reply_only', payload: null }

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() || ''

        for (const line of lines) {
          if (!line.trim()) continue
          const event = JSON.parse(line) as
            | { type: 'assistant_start' }
            | { type: 'assistant_delta'; delta: string }
            | { type: 'assistant_done'; message: string; tool?: ToolResult; error?: string }

          if (event.type === 'assistant_delta') {
            setMessages((current) => current.map((item) => (
              item.id === assistantId
                ? { ...item, content: item.content + event.delta }
                : item
            )))
          }

          if (event.type === 'assistant_done') {
            finalTool = event.tool || { name: 'reply_only', payload: null }
            if (event.error) {
              toast.error(event.error)
            }
          }
        }
      }

      applyToolResult(finalTool)
    } catch (error) {
      setMessages((current) => current.map((item) => (
        item.id === assistantId
          ? { ...item, content: '抱歉，这次执行失败了，请重试。' }
          : item
      )))
      toast.error(error instanceof Error ? error.message : 'AI 对话失败')
    } finally {
      setStreamingId(null)
      setLoading(false)
    }
  }, [applyToolResult, articleKey, documentJson, documentText, editor, input, loading, postSlug, title, toast])

  if (!hydrated) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-[var(--editor-muted)]">
        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
        载入 AI 会话中…
      </div>
    )
  }

  return (
    <div className="flex h-full min-h-0 flex-col bg-[var(--background)]">
      <div className="flex items-center justify-between border-b border-[var(--editor-line)] px-4 py-3">
        <div>
          <div className="text-sm font-semibold text-[var(--editor-ink)]">AI 助手</div>
          <div className="text-xs text-[var(--editor-muted)]">仅作用于当前文章</div>
        </div>
        <button
          type="button"
          onClick={() => void resetThread()}
          className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-[var(--editor-muted)] transition hover:bg-[var(--editor-soft)] hover:text-[var(--editor-ink)]"
          title="清空当前文章会话"
        >
          <RefreshCw className="h-4 w-4" />
        </button>
      </div>

      <div ref={listRef} className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-4">
        {messages.length === 0 ? (
          <div className="space-y-4 pt-6">
            <div className="rounded-2xl border border-dashed border-[var(--editor-line)] bg-[var(--editor-panel)]/70 px-4 py-5 text-sm leading-6 text-[var(--editor-muted)]">
              这里是当前文章专属的 AI 对话框。你可以让它润色、补写、改段落，或者直接为文章自动配图。
            </div>
            <div className="flex flex-wrap gap-2">
              {suggestedPrompts.map((prompt) => (
                <button
                  key={prompt}
                  type="button"
                  onClick={() => {
                    setInput(prompt)
                    textareaRef.current?.focus()
                  }}
                  className="rounded-full border border-[var(--editor-line)] bg-white px-3 py-1.5 text-xs text-[var(--editor-ink)] transition hover:border-[var(--editor-accent)]/40 hover:bg-[var(--editor-soft)]"
                >
                  {prompt}
                </button>
              ))}
            </div>
          </div>
        ) : (
          messages.map((message) => (
            <div
              key={message.id}
              className={message.role === 'user' ? 'flex justify-end' : 'flex justify-start'}
            >
              <div
                className={`max-w-[92%] rounded-2xl px-4 py-3 text-sm leading-6 ${
                  message.role === 'user'
                    ? 'bg-[var(--editor-accent)] text-white'
                    : 'border border-[var(--editor-line)] bg-white text-[var(--editor-ink)]'
                }`}
              >
                {message.content || (
                  message.id === streamingId
                    ? <span className="text-[var(--editor-muted)]">AI 正在思考…</span>
                    : ''
                )}
              </div>
            </div>
          ))
        )}
      </div>

      <div className="border-t border-[var(--editor-line)] px-4 py-4">
        <div className="mb-3 flex flex-wrap gap-2">
          {suggestedPrompts.map((prompt) => (
            <button
              key={prompt}
              type="button"
              onClick={() => void sendMessage(prompt)}
              disabled={loading || !editor}
              className="rounded-full border border-[var(--editor-line)] bg-white px-3 py-1.5 text-xs text-[var(--editor-ink)] transition hover:border-[var(--editor-accent)]/40 hover:bg-[var(--editor-soft)] disabled:opacity-50"
            >
              {prompt}
            </button>
          ))}
        </div>

        <div className="rounded-[24px] border border-[var(--editor-line)] bg-white p-2 shadow-sm">
          <div className="flex items-end gap-2">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl bg-[var(--editor-soft)] text-[var(--editor-accent)]">
              <Sparkles className="h-4 w-4" />
            </div>
            <textarea
              ref={textareaRef}
              rows={1}
              value={input}
              onChange={(event) => setInput(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' && !event.shiftKey) {
                  event.preventDefault()
                  void sendMessage()
                }
              }}
              placeholder="告诉 AI 你想怎么改这篇文章…"
              className="max-h-40 min-h-[40px] flex-1 resize-none border-0 bg-transparent px-1 py-2 text-sm leading-6 text-[var(--editor-ink)] outline-none"
            />
            <button
              type="button"
              onClick={() => void sendMessage()}
              disabled={loading || !input.trim() || !editor}
              className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-[var(--editor-accent)] text-white transition hover:brightness-105 disabled:opacity-50"
            >
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            </button>
          </div>
        </div>

        <div className="mt-2 text-[11px] text-[var(--editor-muted)]">
          AI 默认优先局部编辑，也可以自动给全文规划并插入多张配图。
        </div>
      </div>
    </div>
  )
}

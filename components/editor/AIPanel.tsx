'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { Loader2, Mic, Send } from 'lucide-react'
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
        .filter((item): item is { id: number; role: 'user' | 'assistant'; content: string } => (
          item.role === 'user' || item.role === 'assistant'
        ))
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
        载入中
      </div>
    )
  }

  return (
    <div className="flex h-full min-h-0 flex-col bg-[var(--background)]">
      <div className="px-5 py-4">
        <div className="text-sm font-medium text-[var(--editor-ink)]">Assistant</div>
      </div>

      <div ref={listRef} className="min-h-0 flex-1 space-y-7 overflow-y-auto px-5 py-6">
        {messages.length === 0 ? (
          <div className="pt-2 text-sm leading-7 text-[var(--editor-muted)]">
            从这里直接和 AI 对话，它会基于当前文章上下文回答。
          </div>
        ) : (
          messages.map((message) => (
            <div
              key={message.id}
              className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
            >
              <div
                className={`max-w-[88%] text-sm leading-7 ${
                  message.role === 'user'
                    ? 'rounded-2xl bg-[color-mix(in_srgb,var(--editor-line)_55%,white)] px-4 py-3 text-[var(--editor-ink)]'
                    : 'px-0 py-0 text-[var(--editor-ink)]'
                }`}
              >
                {message.role === 'assistant' && !message.content && message.id === streamingId ? (
                  <span className="text-[var(--editor-muted)]">AI 正在思考…</span>
                ) : (
                  message.content
                )}
              </div>
            </div>
          ))
        )}
      </div>

      <div className="px-5 pb-5">
        <div className="rounded-[28px] border border-[color-mix(in_srgb,var(--editor-line)_88%,white)] bg-[color-mix(in_srgb,white_82%,var(--editor-soft))] px-4 py-3 shadow-[0_12px_32px_rgba(15,23,42,0.06)]">
          <div className="mb-3 inline-flex max-w-full items-center gap-2 rounded-full bg-[color-mix(in_srgb,var(--editor-line)_38%,white)] px-3 py-2 text-sm text-[var(--editor-ink)]">
            <span className="shrink-0">📄</span>
            <span className="truncate">{title.trim() || '当前文章'}</span>
          </div>

          <div className="flex items-end gap-3">
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
              placeholder="消息"
              className="max-h-40 min-h-[84px] flex-1 resize-none border-0 bg-transparent py-1 text-base leading-7 text-[var(--editor-ink)] outline-none placeholder:text-[color-mix(in_srgb,var(--editor-muted)_74%,transparent)]"
            />
          </div>

          <div className="mt-3 flex items-center justify-end gap-4 text-[var(--editor-ink)]">
            <button
              type="button"
              onClick={() => void resetThread()}
              className="editor-quiet-icon-button h-9 w-9 shrink-0 cursor-pointer"
              title="清空当前文章会话"
            >
              <span className="text-xl leading-none">∞</span>
            </button>
            <button
              type="button"
              disabled
              className="editor-quiet-icon-button h-9 w-9 shrink-0 cursor-not-allowed opacity-45"
              title="语音输入"
            >
              <Mic className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={() => void sendMessage()}
              disabled={loading || !input.trim() || !editor}
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[color-mix(in_srgb,var(--editor-line)_62%,white)] text-[var(--editor-ink)] transition hover:bg-[color-mix(in_srgb,var(--editor-line)_80%,white)] disabled:cursor-not-allowed disabled:opacity-40"
            >
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

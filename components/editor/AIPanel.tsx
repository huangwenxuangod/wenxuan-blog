'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { Loader2, Plus, Send } from 'lucide-react'
import type { EditorInstance, JSONContent } from 'novel'
import type { LegacyEditorAiTool } from '@/lib/ai-editor/action-schema'
import {
  applyEditorAiAction,
  applyLegacyToolResult,
  getActiveBlockIndex,
} from '@/lib/ai-editor/client-execution'
import type { EditorAiAction } from '@/lib/ai-editor/runtime-types'
import { renderMarkdownToHtml } from '@/lib/editor-markdown'
import { useToast } from '@/components/Toast'
import { UiIconButton, UiPanel, UiTextarea } from '@/components/ui/primitives'
import { Tooltip } from '@/components/ui/Tooltip'

type ChatMessage = {
  id: string
  role: 'user' | 'assistant'
  content: string
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

type ChatEvent =
  | { type: 'assistant_start' }
  | { type: 'assistant_delta'; delta: string }
  | { type: 'action_ready'; action: EditorAiAction }
  | { type: 'tool_pending'; tool: string; payload?: unknown }
  | { type: 'tool_result'; tool: string; payload?: unknown }
  | { type: 'assistant_done'; message: string; tool?: LegacyEditorAiTool; error?: string }
  | { type: 'assistant_error'; error: string }

function createMessageId(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

function shouldApplyImmediately(action: EditorAiAction) {
  return action.type !== 'plan_article_images'
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
  const [toolStatus, setToolStatus] = useState<string | null>(null)
  const listRef = useRef<HTMLDivElement | null>(null)
  const textareaRef = useRef<HTMLTextAreaElement | null>(null)

  const resizeComposer = useCallback(() => {
    const node = textareaRef.current
    if (!node) return
    node.style.height = '0px'
    node.style.height = `${Math.min(node.scrollHeight, 144)}px`
  }, [])

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
  }, [messages, loading, toolStatus])

  useEffect(() => {
    resizeComposer()
  }, [input, resizeComposer])

  const sendMessage = useCallback(async (rawInput?: string) => {
    const nextInput = (rawInput ?? input).trim()
    if (!nextInput || loading) return

    const userMessage: ChatMessage = {
      id: createMessageId('user'),
      role: 'user',
      content: nextInput,
    }
    const assistantId = createMessageId('assistant')
    const activeBlockIndex = editor ? getActiveBlockIndex(editor) : null
    const selectionText = editor
      ? editor.state.doc.textBetween(
          editor.state.selection.from,
          editor.state.selection.to,
          '\n',
        ).trim() || null
      : null

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
    setToolStatus(null)
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
          activeBlockIndex,
          selectionText,
        }),
      })

      if (!response.ok || !response.body) {
        const { parseApiError } = await import('@/lib/api-client')
        const apiError = await parseApiError(response)
        throw apiError
      }

      const reader = response.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''
      let finalTool: LegacyEditorAiTool = { name: 'reply_only', payload: null }
      let actionApplied = false

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() || ''

        for (const line of lines) {
          if (!line.trim()) continue
          const event = JSON.parse(line) as ChatEvent

          if (event.type === 'assistant_delta') {
            setMessages((current) => current.map((item) => (
              item.id === assistantId
                ? { ...item, content: item.content + event.delta }
                : item
            )))
            continue
          }

          if (event.type === 'action_ready') {
            if (!actionApplied && shouldApplyImmediately(event.action)) {
              if (editor) {
                applyEditorAiAction(editor, event.action)
                actionApplied = true
              }
            }
            continue
          }

          if (event.type === 'tool_pending') {
            if (event.tool === 'plan_article_images') {
              setToolStatus('AI 正在生成并插入配图…')
            }
            continue
          }

          if (event.type === 'tool_result') {
            if (event.tool === 'plan_article_images') {
              setToolStatus('配图已生成，正在写入编辑器…')
            }
            continue
          }

            if (event.type === 'assistant_done') {
              finalTool = event.tool || { name: 'reply_only', payload: null }
              if (!actionApplied && finalTool.name !== 'plan_article_images') {
                if (editor) {
                  applyLegacyToolResult(editor, finalTool)
                }
                actionApplied = true
              }
              if (event.error) {
                toast.error(event.error)
              }
              setStreamingId(null)
              setToolStatus(null)
              setLoading(false)
              continue
            }

          if (event.type === 'assistant_error') {
            toast.error(event.error)
          }
        }
      }

      if ((!actionApplied || finalTool.name === 'plan_article_images') && editor) {
        applyLegacyToolResult(editor, finalTool)
      }
    } catch (error) {
      setMessages((current) => current.map((item) => (
        item.id === assistantId
          ? { ...item, content: '抱歉，这次执行失败了，请重试。' }
          : item
      )))
      
      const { ApiClientError } = await import('@/lib/api-client')
      if (error instanceof ApiClientError) {
        let errMsg = error.message
        if (error.requestId && error.requestId !== 'unknown') {
          errMsg += ` [ID: ${error.requestId.slice(0, 8)}]`
        }
        if (error.hint) {
          errMsg += ` (${error.hint})`
        }
        toast.error(errMsg)
      } else {
        toast.error(error instanceof Error ? error.message : 'AI 对话失败')
      }
    } finally {
      setStreamingId(null)
      setToolStatus(null)
      setLoading(false)
    }
  }, [articleKey, documentJson, documentText, editor, input, loading, postSlug, title, toast])

  if (!hydrated) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-[var(--editor-muted)]">
        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
        载入中
      </div>
    )
  }

  return (
    <div className="flex h-full min-h-0 flex-col bg-transparent">
      <div ref={listRef} className="editor-scroll-shell ai-chat-scroll min-h-0 flex-1 space-y-6 overflow-y-auto px-1 pb-4">
        {messages.length === 0 ? (
          null
        ) : (
          messages.map((message) => (
            <div
              key={message.id}
              className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
            >
              <div
                className={`max-w-[90%] text-sm leading-7 ${
                  message.role === 'user'
                    ? 'rounded-[1.15rem] bg-[color-mix(in_srgb,var(--editor-line)_62%,transparent)] px-4 py-3 text-[var(--editor-ink)]'
                    : 'px-0 py-0 text-[var(--editor-ink)]'
                }`}
              >
                {message.role === 'assistant' && !message.content && message.id === streamingId ? (
                  <span className="text-[var(--editor-muted)]">AI 正在思考…</span>
                ) : message.role === 'assistant' ? (
                  <div
                    className="prose prose-sm max-w-none prose-headings:mb-3 prose-headings:mt-5 prose-p:my-3 prose-li:my-1 prose-ul:my-3 prose-ol:my-3 prose-strong:text-[var(--editor-ink)] prose-p:text-[var(--editor-ink)] prose-li:text-[var(--editor-ink)]"
                    dangerouslySetInnerHTML={{ __html: renderMarkdownToHtml(message.content) }}
                  />
                ) : (
                  message.content
                )}
              </div>
            </div>
          ))
        )}
      </div>

      <div className="px-1 pb-1 pt-3">
        <UiPanel inset="soft" className="rounded-[1.55rem] border-[color-mix(in_srgb,var(--ui-line)_88%,transparent)] bg-[color-mix(in_srgb,var(--ui-bg)_98%,var(--ui-soft))] px-4 py-2.5 shadow-[0_10px_28px_rgb(var(--ui-shadow-rgb)/0.08)]">
          {toolStatus ? (
            <div className="pb-2 text-xs text-[color-mix(in_srgb,var(--ui-muted)_88%,transparent)]">
              {toolStatus}
            </div>
          ) : null}

          <UiTextarea
            ref={textareaRef}
            rows={1}
            variant="composer"
            value={input}
            onChange={(event) => setInput(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && !event.shiftKey) {
                event.preventDefault()
                void sendMessage()
              }
            }}
            placeholder="输入你的修改意图"
            className="min-h-[3.5rem] max-h-36 overflow-y-auto text-[15px] leading-7 placeholder:text-[color-mix(in_srgb,var(--ui-muted)_66%,transparent)]"
          />

          <div className="mt-2 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2.5">
              <Tooltip content="更多操作">
                <UiIconButton
                  tone="soft"
                  className="h-9 w-9 rounded-full bg-[color-mix(in_srgb,var(--ui-bg)_94%,var(--ui-soft))]"
                  aria-label="更多操作"
                >
                  <Plus className="h-4.5 w-4.5" />
                </UiIconButton>
              </Tooltip>
            </div>

            <div className="flex items-center gap-2.5">
              <Tooltip content="发送">
                <UiIconButton
                  tone="soft"
                  onClick={() => void sendMessage()}
                  disabled={loading || !input.trim()}
                  aria-label="发送"
                  className="h-9 w-9 rounded-full bg-[color-mix(in_srgb,var(--ui-bg)_94%,var(--ui-soft))]"
                >
                  {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-[1.05rem] w-[1.05rem]" />}
                </UiIconButton>
              </Tooltip>
            </div>
          </div>
        </UiPanel>
      </div>
    </div>
  )
}

'use client'

import { Menu, MenuButton, MenuItem, MenuItems, Transition } from '@headlessui/react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Bot, ChevronDown, Image as ImageIcon, Loader2, Send, SlidersHorizontal, X } from 'lucide-react'
import type { EditorInstance, JSONContent } from 'novel'
import type { LegacyEditorAiTool } from '@/lib/ai-editor/action-schema'
import {
  applyEditorAiAction,
  applyLegacyToolResult,
  getActiveBlockIndex,
  getInsertPositionForBlock,
} from '@/lib/ai-editor/client-execution'
import {
  buildSkillCommandEntries,
  getSkillSlashQuery,
  parseSkillCommandInput,
  type SkillCommandEntry,
} from '@/lib/ai-editor/skill-command'
import type { EditorAiAction } from '@/lib/ai-editor/runtime-types'
import { insertGeneratedImageAtPosition } from '@/lib/editor-file-upload'
import { renderMarkdownToHtml } from '@/lib/editor-markdown'
import { useToast } from '@/components/Toast'
import { cx, UiIconButton, UiPanel, UiTextarea } from '@/components/ui/primitives'
import { Tooltip } from '@/components/ui/Tooltip'

type ChatMessage = {
  id: string
  role: 'user' | 'assistant'
  content: string
  pending?: boolean
}

type SkillOption = {
  id: number
  name: string
  description: string
  version: string
}

type ProviderOption = {
  id: number
  name: string
  model: string
  is_default: number
}

type SkillMatchResponse = {
  match?: {
    skillId: number
    name: string
    description: string
    trigger: string
    score: number
    reason: string
  } | null
}

interface AIPanelProps {
  articleKey: string
  postSlug: string | null
  title: string
  editor: EditorInstance | null
  documentJson: JSONContent | null
  documentText: string
  profilesRefreshKey?: number
  onTitleApply?: (nextTitle: string) => void
  onCoverImageApply?: (imageUrl: string) => void
  onOpenSettingsTab?: (tabId: 'ai-provider' | 'ai-image-provider') => void
}

type ChatEvent =
  | { type: 'assistant_start' }
  | { type: 'assistant_delta'; delta: string }
  | { type: 'action_ready'; action: EditorAiAction }
  | { type: 'tool_pending'; tool: string; payload?: unknown }
  | { type: 'tool_result'; tool: string; payload?: unknown }
  | { type: 'assistant_done'; message: string; tool?: LegacyEditorAiTool; error?: string }
  | { type: 'assistant_error'; error: string }

type GeneratedImageResult = {
  url: string
  alt: string
}

function legacyGenerateImagesToolToAction(tool: LegacyEditorAiTool): Extract<EditorAiAction, { type: 'generate_images' }> | null {
  if (tool.name !== 'generate_images') return null
  if (!Array.isArray(tool.payload.images) || tool.payload.images.length === 0) return null

  const images = tool.payload.images
    .slice(0, 5)
    .map((item) => ({
      prompt: String(item.prompt || ''),
      usage: item.usage === 'cover' ? 'cover' as const : 'inline' as const,
      anchorBlockIndex: typeof item.anchorBlockIndex === 'number' ? item.anchorBlockIndex : undefined,
      alt: typeof item.alt === 'string' ? item.alt : undefined,
      aspectRatio: typeof item.aspectRatio === 'string' ? item.aspectRatio : undefined,
      resolution: typeof item.resolution === 'string' ? item.resolution : undefined,
      imageProfileId: null,
    }))
    .filter((item) => item.prompt.trim().length > 0)

  if (images.length === 0) return null

  return {
    type: 'generate_images',
    images,
  }
}

function createMessageId(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

function shouldApplyImmediately(action: EditorAiAction) {
  return action.type !== 'generate_images'
}

const TEXT_PROFILE_STORAGE_KEY = 'qmblog:editor-ai-text-profile-id'
const IMAGE_PROFILE_STORAGE_KEY = 'qmblog:editor-ai-image-profile-id'

function resolveActiveProfile(profiles: ProviderOption[], selectedId: string) {
  return profiles.find((profile) => String(profile.id) === selectedId) || null
}

function resolveFallbackProfileId(
  profiles: ProviderOption[],
  selectedId: string,
) {
  if (profiles.some((profile) => String(profile.id) === selectedId)) {
    return selectedId
  }

  const defaultProfile = profiles.find((profile) => profile.is_default === 1)
  if (defaultProfile) {
    return String(defaultProfile.id)
  }

  return profiles[0] ? String(profiles[0].id) : ''
}

export function AIPanel({
  articleKey,
  postSlug,
  title,
  editor,
  documentJson,
  documentText,
  profilesRefreshKey = 0,
  onTitleApply,
  onCoverImageApply,
  onOpenSettingsTab,
}: AIPanelProps) {
  const toast = useToast()
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [hydrated, setHydrated] = useState(false)
  const [streamingId, setStreamingId] = useState<string | null>(null)
  const [toolStatus, setToolStatus] = useState<string | null>(null)
  const [skills, setSkills] = useState<SkillOption[]>([])
  const [selectedSkillId, setSelectedSkillId] = useState('')
  const [selectedSkillSource, setSelectedSkillSource] = useState<'manual' | 'auto' | null>(null)
  const [textProfiles, setTextProfiles] = useState<ProviderOption[]>([])
  const [imageProfiles, setImageProfiles] = useState<ProviderOption[]>([])
  const [selectedTextProfileId, setSelectedTextProfileId] = useState('')
  const [selectedImageProfileId, setSelectedImageProfileId] = useState('')
  const [slashMenuIndex, setSlashMenuIndex] = useState(0)
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
          pending: item.role === 'assistant' && !item.content.trim(),
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
    let cancelled = false
    void Promise.all([
      fetch('/api/editor/skills', { credentials: 'include' })
        .then(async (response) => {
          if (!response.ok) return { skills: [] }
          return response.json() as Promise<{ skills?: SkillOption[] }>
        }),
      fetch('/api/admin/ai-provider', { credentials: 'include' })
        .then(async (response) => {
          if (!response.ok) return { profiles: [], default_profile_id: null }
          return response.json() as Promise<{ profiles?: ProviderOption[]; default_profile_id?: number | null }>
        }),
      fetch('/api/admin/ai-image-provider', { credentials: 'include' })
        .then(async (response) => {
          if (!response.ok) return { profiles: [], default_profile_id: null }
          return response.json() as Promise<{ profiles?: ProviderOption[]; default_profile_id?: number | null }>
        }),
    ])
      .then(([skillsData, textProfilesData, imageProfilesData]) => {
        if (cancelled) return

        const nextTextProfiles = textProfilesData.profiles || []
        const nextImageProfiles = imageProfilesData.profiles || []

        setSkills(skillsData.skills || [])
        setTextProfiles(nextTextProfiles)
        setImageProfiles(nextImageProfiles)

        const storedTextProfileId = typeof window !== 'undefined'
          ? window.localStorage.getItem(TEXT_PROFILE_STORAGE_KEY) || ''
          : ''
        const storedImageProfileId = typeof window !== 'undefined'
          ? window.localStorage.getItem(IMAGE_PROFILE_STORAGE_KEY) || ''
          : ''

        const fallbackTextProfileId = textProfilesData.default_profile_id
          ? String(textProfilesData.default_profile_id)
          : nextTextProfiles.find((profile) => profile.is_default === 1)?.id
            ? String(nextTextProfiles.find((profile) => profile.is_default === 1)?.id)
            : ''
        const fallbackImageProfileId = imageProfilesData.default_profile_id
          ? String(imageProfilesData.default_profile_id)
          : nextImageProfiles.find((profile) => profile.is_default === 1)?.id
            ? String(nextImageProfiles.find((profile) => profile.is_default === 1)?.id)
            : ''

        setSelectedTextProfileId(
          resolveFallbackProfileId(
            nextTextProfiles,
            storedTextProfileId || fallbackTextProfileId,
          ),
        )
        setSelectedImageProfileId(
          resolveFallbackProfileId(
            nextImageProfiles,
            storedImageProfileId || fallbackImageProfileId,
          ),
        )
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [profilesRefreshKey])

  useEffect(() => {
    if (typeof window === 'undefined') return
    if (selectedTextProfileId) {
      window.localStorage.setItem(TEXT_PROFILE_STORAGE_KEY, selectedTextProfileId)
    } else {
      window.localStorage.removeItem(TEXT_PROFILE_STORAGE_KEY)
    }
  }, [selectedTextProfileId])

  useEffect(() => {
    if (typeof window === 'undefined') return
    if (selectedImageProfileId) {
      window.localStorage.setItem(IMAGE_PROFILE_STORAGE_KEY, selectedImageProfileId)
    } else {
      window.localStorage.removeItem(IMAGE_PROFILE_STORAGE_KEY)
    }
  }, [selectedImageProfileId])

  useEffect(() => {
    const node = listRef.current
    if (!node) return
    node.scrollTop = node.scrollHeight
  }, [messages, loading, toolStatus])

  useEffect(() => {
    resizeComposer()
  }, [input, resizeComposer])

  const activeTextProfile = useMemo(
    () => resolveActiveProfile(textProfiles, selectedTextProfileId),
    [selectedTextProfileId, textProfiles],
  )
  const activeImageProfile = useMemo(
    () => resolveActiveProfile(imageProfiles, selectedImageProfileId),
    [imageProfiles, selectedImageProfileId],
  )
  const skillCommandEntries = useMemo<SkillCommandEntry[]>(
    () => buildSkillCommandEntries(skills),
    [skills],
  )
  const slashQuery = useMemo(
    () => getSkillSlashQuery(input),
    [input],
  )
  const slashMenuOptions = useMemo(() => {
    const trimmedLeft = input.replace(/^\s+/, '')
    if (!trimmedLeft.startsWith('/')) return []
    const normalizedQuery = slashQuery.trim().toLowerCase()
    if (!normalizedQuery) return skillCommandEntries
    return skillCommandEntries.filter((entry) => (
      entry.trigger.includes(normalizedQuery)
      || entry.name.toLowerCase().includes(normalizedQuery)
      || entry.description.toLowerCase().includes(normalizedQuery)
    ))
  }, [input, skillCommandEntries, slashQuery])
  const slashMenuOpen = slashMenuOptions.length > 0 && input.replace(/^\s+/, '').startsWith('/')
  const selectedSkill = useMemo(
    () => skills.find((skill) => String(skill.id) === selectedSkillId) || null,
    [selectedSkillId, skills],
  )

  useEffect(() => {
    setSlashMenuIndex(0)
  }, [slashQuery, slashMenuOpen])

  const handleSelectSkillCommand = useCallback((entry: SkillCommandEntry) => {
    setSelectedSkillId(String(entry.id))
    setSelectedSkillSource('manual')
    setInput('')
    setSlashMenuIndex(0)
    textareaRef.current?.focus()
  }, [])

  const clearSelectedSkill = useCallback(() => {
    setSelectedSkillId('')
    setSelectedSkillSource(null)
  }, [])

  const runGenerateImagesAction = useCallback(async (
    action: Extract<EditorAiAction, { type: 'generate_images' }>,
  ) => {
    const images = action.images.slice(0, 5)
    if (images.length === 0) return

    let completedCount = 0

    setToolStatus(`AI 正在并发生成 ${images.length} 张图片…`)

    const results = await Promise.allSettled(images.map(async (item, index) => {
      setToolStatus(`AI 正在生成第 ${index + 1}/${images.length} 张图片…`)

      const response = await fetch('/api/editor/ai-image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sceneKey: item.usage === 'cover' ? 'article_cover' : 'editor_inline',
          prompt: item.prompt,
          articleTitle: title,
          contextText: documentText.slice(0, 4000),
          aspectRatio: item.aspectRatio || (item.usage === 'cover' ? '5:2' : undefined),
          resolution: item.resolution,
          profileId: item.imageProfileId ?? (selectedImageProfileId ? Number(selectedImageProfileId) : null),
        }),
      })

      const payload = await response.json().catch(() => ({})) as {
        error?: string
        image?: GeneratedImageResult
      }

      if (!response.ok || !payload.image) {
        throw new Error(payload.error || `第 ${index + 1} 张图片生成失败`)
      }

      completedCount += 1
      setToolStatus(`已生成 ${completedCount}/${images.length} 张图片…`)

      if (item.usage === 'cover') {
        onCoverImageApply?.(payload.image.url)
        return
      }

      if (!editor) {
        return
      }

      const insertPos = Number.isFinite(item.anchorBlockIndex)
        ? getInsertPositionForBlock(editor, Number(item.anchorBlockIndex), 'after')
        : editor.state.selection.to

      insertGeneratedImageAtPosition(
        editor,
        payload.image.url,
        item.alt || payload.image.alt,
        insertPos,
      )
    }))

    const failedCount = results.filter((result) => result.status === 'rejected').length
    if (failedCount > 0) {
      toast.error(`${failedCount} 张图片生成失败，其余已继续完成`)
    }

    setToolStatus(
      failedCount > 0
        ? `图片生成完成，成功 ${images.length - failedCount} 张，失败 ${failedCount} 张`
        : `图片生成完成，共 ${images.length} 张`,
    )

    window.setTimeout(() => {
      setToolStatus((current) => (
        current?.includes('图片生成完成') ? null : current
      ))
    }, 2200)
  }, [documentText, editor, onCoverImageApply, selectedImageProfileId, title, toast])

  const sendMessage = useCallback(async (rawInput?: string) => {
    const rawNextInput = rawInput ?? input
    const parsedCommand = parseSkillCommandInput(rawNextInput, skillCommandEntries)
    let nextInput = parsedCommand.messageWithoutCommand.trim()
    let effectiveSkillId = selectedSkillId
    let effectiveSkillSource = selectedSkillSource

    if (parsedCommand.mode === 'manual' && parsedCommand.matchedSkillId) {
      effectiveSkillId = String(parsedCommand.matchedSkillId)
      effectiveSkillSource = 'manual'
      setSelectedSkillId(String(parsedCommand.matchedSkillId))
      setSelectedSkillSource('manual')
    }

    if (!nextInput || loading) return

    if (!effectiveSkillId && nextInput.length >= 6) {
      try {
        const matchResponse = await fetch('/api/editor/skills/match', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ query: nextInput }),
        })
        if (matchResponse.ok) {
          const matchData = await matchResponse.json() as SkillMatchResponse
          if (matchData.match?.skillId) {
            effectiveSkillId = String(matchData.match.skillId)
            effectiveSkillSource = 'auto'
            setSelectedSkillId(String(matchData.match.skillId))
            setSelectedSkillSource('auto')
          }
        }
      } catch {
        // ignore auto-match failures and continue as plain chat
      }
    }

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
        pending: true,
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
          skillId: effectiveSkillId ? Number(effectiveSkillId) : null,
          textProfileId: selectedTextProfileId ? Number(selectedTextProfileId) : null,
          imageProfileId: selectedImageProfileId ? Number(selectedImageProfileId) : null,
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
      let deferredImageAction: Extract<EditorAiAction, { type: 'generate_images' }> | null = null

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
                ? { ...item, content: item.content + event.delta, pending: false }
                : item
            )))
            continue
          }

          if (event.type === 'action_ready') {
            if (!actionApplied && shouldApplyImmediately(event.action)) {
              if (event.action.type === 'edit_title' && onTitleApply) {
                onTitleApply(event.action.title)
                actionApplied = true
              } else if (editor) {
                applyEditorAiAction(editor, event.action)
                actionApplied = true
              }
            } else if (event.action.type === 'generate_images') {
              deferredImageAction = event.action
            }
            continue
          }

          if (event.type === 'tool_pending') {
            if (event.tool === 'generate_images') {
              const count = (
                event.payload
                && typeof event.payload === 'object'
                && 'count' in event.payload
                && typeof event.payload.count === 'number'
              ) ? event.payload.count : 0
              setToolStatus(count > 0 ? `AI 已规划 ${count} 张图片，准备开始生成…` : 'AI 正在规划图片…')
            }
            continue
          }

          if (event.type === 'tool_result') {
            continue
          }

          if (event.type === 'assistant_done') {
              if (event.message) {
                setMessages((current) => current.map((item) => (
                  item.id === assistantId
                    ? { ...item, content: event.message, pending: false }
                    : item
                )))
              } else {
                setMessages((current) => current.map((item) => (
                  item.id === assistantId
                    ? { ...item, pending: true }
                    : item
                )))
              }
              finalTool = event.tool || { name: 'reply_only', payload: null }
              if (!actionApplied && finalTool.name !== 'generate_images') {
                if (finalTool.name === 'edit_title' && onTitleApply) {
                  onTitleApply(finalTool.payload.title)
                } else if (editor) {
                  applyLegacyToolResult(editor, finalTool)
                }
                actionApplied = true
              }
              if (event.error) {
                toast.error(event.error)
              }
              setStreamingId(null)
              setLoading(false)
              continue
            }

          if (event.type === 'assistant_error') {
            toast.error(event.error)
          }
        }
      }

      if (!actionApplied) {
        if (finalTool.name === 'edit_title' && onTitleApply) {
          onTitleApply(finalTool.payload.title)
        } else if (editor) {
          applyLegacyToolResult(editor, finalTool)
        }
      }

      const imageAction = deferredImageAction || legacyGenerateImagesToolToAction(finalTool)

      if (imageAction) {
        await runGenerateImagesAction(imageAction)
      } else {
        setToolStatus(null)
      }
    } catch (error) {
      setMessages((current) => current.map((item) => (
        item.id === assistantId
          ? { ...item, content: '抱歉，这次执行失败了，请重试。', pending: false }
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
      setLoading(false)
    }
  }, [articleKey, documentJson, documentText, editor, input, loading, onCoverImageApply, onTitleApply, postSlug, selectedImageProfileId, selectedSkillId, selectedSkillSource, selectedTextProfileId, skillCommandEntries, title, toast])

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
                ) : message.role === 'assistant' && !message.content && message.pending ? (
                  <span className="text-[var(--editor-muted)]">上次 AI 回复未完成，你可以继续追问。</span>
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

          {selectedSkill ? (
            <div className="mb-2 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={clearSelectedSkill}
                className="inline-flex items-center gap-1.5 rounded-full border border-[color-mix(in_srgb,var(--ui-line)_88%,transparent)] bg-[color-mix(in_srgb,var(--ui-bg)_84%,var(--ui-soft))] px-3 py-1 text-xs text-[var(--ui-ink)] transition hover:bg-[color-mix(in_srgb,var(--ui-line)_24%,transparent)]"
              >
                <span>{selectedSkill.name}</span>
                {selectedSkillSource === 'auto' ? (
                  <span className="text-[var(--ui-muted)]">· 自动</span>
                ) : null}
                <X className="h-3.5 w-3.5 text-[var(--ui-muted)]" />
              </button>
            </div>
          ) : null}

          <div className="relative">
            <UiTextarea
              ref={textareaRef}
              rows={1}
              variant="composer"
              value={input}
              onChange={(event) => setInput(event.target.value)}
              onKeyDown={(event) => {
                if (slashMenuOpen && (event.key === 'ArrowDown' || event.key === 'ArrowUp')) {
                  event.preventDefault()
                  setSlashMenuIndex((current) => {
                    const next = event.key === 'ArrowDown' ? current + 1 : current - 1
                    if (next < 0) return slashMenuOptions.length - 1
                    if (next >= slashMenuOptions.length) return 0
                    return next
                  })
                  return
                }

                if (slashMenuOpen && event.key === 'Enter' && !event.shiftKey) {
                  event.preventDefault()
                  const currentEntry = slashMenuOptions[slashMenuIndex]
                  if (currentEntry) {
                    handleSelectSkillCommand(currentEntry)
                    return
                  }
                }

                if (event.key === 'Enter' && !event.shiftKey) {
                  event.preventDefault()
                  void sendMessage()
                }
              }}
              placeholder="输入你的修改意图，或输入 / 调用 skill"
              className="min-h-[3.5rem] max-h-36 overflow-y-auto text-[15px] leading-7 placeholder:text-[color-mix(in_srgb,var(--ui-muted)_66%,transparent)]"
            />

            <Transition
              show={slashMenuOpen}
              enter="transition duration-150 ease-out"
              enterFrom="translate-y-1 opacity-0"
              enterTo="translate-y-0 opacity-100"
              leave="transition duration-120 ease-in"
              leaveFrom="translate-y-0 opacity-100"
              leaveTo="translate-y-1 opacity-0"
            >
              <div className="ui-popover absolute bottom-[calc(100%+10px)] left-0 z-40 w-full overflow-hidden rounded-[1rem] p-1">
                {slashMenuOptions.map((entry, index) => (
                  <button
                    key={`${entry.id}-${entry.trigger}`}
                    type="button"
                    onClick={() => handleSelectSkillCommand(entry)}
                    className={cx(
                      'flex w-full cursor-pointer items-start gap-3 rounded-[0.85rem] px-3 py-2.5 text-left transition',
                      index === slashMenuIndex
                        ? 'bg-[color-mix(in_srgb,var(--editor-line)_36%,transparent)]'
                        : 'hover:bg-[color-mix(in_srgb,var(--editor-line)_20%,transparent)]',
                    )}
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-[var(--ui-ink)]">/{entry.trigger}</span>
                        <span className="truncate text-xs text-[var(--ui-muted)]">{entry.name}</span>
                      </div>
                      <div className="mt-1 line-clamp-2 text-xs leading-5 text-[var(--ui-muted)]">
                        {entry.description}
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            </Transition>
          </div>

          <div className="mt-2 flex items-center justify-between gap-3">
            <div className="flex min-w-0 items-center gap-2.5">
              <Menu>
                <MenuButton className="ui-control group inline-flex h-9 shrink-0 items-center gap-2 rounded-full px-3 text-sm text-[var(--ui-ink)]">
                  <SlidersHorizontal className="h-4 w-4 text-[var(--ui-muted)] transition group-data-[hover]:text-[var(--ui-ink)]" />
                  <span>模型</span>
                  <ChevronDown className="h-4 w-4 text-[var(--ui-muted)] transition duration-150 group-data-[open]:rotate-180 group-data-[hover]:text-[var(--ui-ink)]" />
                </MenuButton>

                <MenuItems
                  anchor="top start"
                  transition
                  className="ui-popover z-50 mb-2 w-[13rem] overflow-hidden rounded-[0.95rem] p-1 outline-none transition duration-150 ease-out data-[closed]:translate-y-1 data-[closed]:opacity-0"
                >
                  <MenuItem>
                    <button
                      type="button"
                      onClick={() => onOpenSettingsTab?.('ai-provider')}
                      className="group flex w-full cursor-pointer items-center gap-2.5 rounded-[0.8rem] px-2.5 py-2 text-left transition data-[focus]:bg-[color-mix(in_srgb,var(--editor-line)_36%,transparent)]"
                      title={activeTextProfile?.model || '未配置'}
                    >
                      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[color-mix(in_srgb,var(--ui-bg)_94%,var(--ui-soft))] text-[var(--ui-muted)]">
                        <Bot className="h-4 w-4" />
                      </span>
                      <span className="min-w-0 flex-1 truncate text-sm text-[var(--ui-ink)]">
                        {activeTextProfile?.model || '去配置'}
                      </span>
                    </button>
                  </MenuItem>

                  <MenuItem>
                    <button
                      type="button"
                      onClick={() => onOpenSettingsTab?.('ai-image-provider')}
                      className="group flex w-full cursor-pointer items-center gap-2.5 rounded-[0.8rem] px-2.5 py-2 text-left transition data-[focus]:bg-[color-mix(in_srgb,var(--editor-line)_36%,transparent)]"
                      title={activeImageProfile?.model || '未配置'}
                    >
                      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[color-mix(in_srgb,var(--ui-bg)_94%,var(--ui-soft))] text-[var(--ui-muted)]">
                        <ImageIcon className="h-4 w-4" />
                      </span>
                      <span className="min-w-0 flex-1 truncate text-sm text-[var(--ui-ink)]">
                        {activeImageProfile?.model || '去配置'}
                      </span>
                    </button>
                  </MenuItem>
                </MenuItems>
              </Menu>
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

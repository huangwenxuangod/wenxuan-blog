'use client'
/* eslint-disable @next/next/no-img-element */

import { Dialog, DialogBackdrop, DialogPanel, DialogTitle } from '@headlessui/react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  Check,
  ChevronDown,
  ChevronUp,
  History,
  Image as ImageIcon,
  Loader2,
  Sparkles,
  X,
} from 'lucide-react'
import { SelectDropdown } from '@/components/SelectDropdown'
import { useToast } from '@/components/Toast'
import {
  UiButton,
  UiIconButton,
  UiPanel,
  UiTextarea,
  cx,
} from '@/components/ui/primitives'
import {
  appendStoredHistoryItem,
  LOCAL_HISTORY_UPDATED_EVENT,
  readStoredHistory,
  startBackgroundTask,
} from '@/lib/client-background-task'
import {
  AI_IMAGE_ASPECT_RATIO_OPTIONS,
  AI_IMAGE_RESOLUTION_OPTIONS,
  getAiImageAspectRatioLabel,
  getAiImageResolutionLabel,
  type AIImageAspectRatio,
  type AIImageResolution,
} from '@/lib/ai-image/options'

interface ImageActionItem {
  id: number
  action_key: string
  label: string
  description: string
  aspect_ratio: AIImageAspectRatio
  resolution: AIImageResolution
  size: string
  profile_id: number | null
}

interface ImageProfileItem {
  id: number
  name: string
  model: string
  is_default: number
}

interface GeneratedImageResult {
  url: string
  alt: string
  revisedPrompt: string
  actionLabel: string
  aspectRatio: AIImageAspectRatio
  resolution: AIImageResolution
  size: string
  profileName: string
  model: string
  variants?: {
    content?: string
  }
}

interface ImageHistoryItem {
  id: string
  image: GeneratedImageResult
  promptLabel: string
  contextPreview: string
  createdAt: number
}

const MAX_HISTORY_ITEMS = 12
const DEFAULT_HISTORY_SCOPE = 'default'
const TEMPLATE_COLLAPSED_HEIGHT = 42

function createHistoryStorageKey(scope: string) {
  return `qmblog:ai-image-history:${scope || DEFAULT_HISTORY_SCOPE}`
}

function formatHistoryTime(timestamp: number) {
  try {
    return new Date(timestamp).toLocaleString('zh-CN', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  } catch {
    return ''
  }
}

interface ImageGenerationModalProps {
  open: boolean
  contextText?: string
  historyScope?: string
  referenceImageUrl?: string
  allowReplace?: boolean
  defaultPlacementMode?: 'insert' | 'replace'
  closeOnGenerate?: boolean
  generationMode?: 'background' | 'foreground'
  onClose: () => void
  onInsert: (imageUrl: string, alt: string, placementMode?: 'insert' | 'replace') => void
}

export function ImageGenerationModal({
  open,
  contextText = '',
  historyScope = DEFAULT_HISTORY_SCOPE,
  referenceImageUrl,
  allowReplace = false,
  defaultPlacementMode = 'insert',
  closeOnGenerate = true,
  generationMode = 'background',
  onClose,
  onInsert,
}: ImageGenerationModalProps) {
  const toast = useToast()
  const promptRef = useRef<HTMLTextAreaElement>(null)
  const templatesRef = useRef<HTMLDivElement>(null)

  const [actions, setActions] = useState<ImageActionItem[]>([])
  const [profiles, setProfiles] = useState<ImageProfileItem[]>([])
  const [selectedAction, setSelectedAction] = useState('')
  const [selectedAspectRatio, setSelectedAspectRatio] = useState<AIImageAspectRatio>('auto')
  const [selectedResolution, setSelectedResolution] = useState<AIImageResolution>('2k')
  const [selectedProfileId, setSelectedProfileId] = useState<number | null>(null)
  const [prompt, setPrompt] = useState('')
  const [result, setResult] = useState<GeneratedImageResult | null>(null)
  const [showContext, setShowContext] = useState(false)
  const [showRevisedPrompt, setShowRevisedPrompt] = useState(false)
  const [historyOpen, setHistoryOpen] = useState(false)
  const [historyItems, setHistoryItems] = useState<ImageHistoryItem[]>([])
  const [historyReady, setHistoryReady] = useState(false)
  const [generating, setGenerating] = useState(false)
  const [placementMode, setPlacementMode] = useState<'insert' | 'replace'>(defaultPlacementMode)
  const [templatesExpanded, setTemplatesExpanded] = useState(false)
  const [templatesOverflowing, setTemplatesOverflowing] = useState(false)

  const historyStorageKey = useMemo(
    () => createHistoryStorageKey(historyScope),
    [historyScope],
  )

  const selectedActionConfig = useMemo(
    () => actions.find((item) => item.action_key === selectedAction) || null,
    [actions, selectedAction],
  )

  const contextPreview = useMemo(() => contextText.trim().slice(0, 240), [contextText])
  const contextCharCount = useMemo(() => Array.from(contextText.trim()).length, [contextText])

  const modelOptions = useMemo(() => {
    return profiles.map((profile) => ({
      value: String(profile.id),
      label: profile.name,
      title: profile.model,
      searchText: `${profile.name} ${profile.model}`,
    }))
  }, [profiles])

  const aspectRatioOptions = useMemo(() => {
    return AI_IMAGE_ASPECT_RATIO_OPTIONS.map((option) => ({
      value: option.value,
      label: option.label,
    }))
  }, [])

  const resolutionOptions = useMemo(() => {
    return AI_IMAGE_RESOLUTION_OPTIONS.map((option) => ({
      value: option.value,
      label: option.label,
    }))
  }, [])

  const canGenerate = Boolean(prompt.trim() || contextText.trim())

  const syncHistoryItems = useCallback(() => {
    setHistoryItems(readStoredHistory<ImageHistoryItem>(historyStorageKey).slice(0, MAX_HISTORY_ITEMS))
    setHistoryReady(true)
  }, [historyStorageKey])

  const storeHistoryItem = useCallback((image: GeneratedImageResult) => {
    const promptLabel = prompt.trim()
      || selectedActionConfig?.label
      || image.actionLabel
      || '自定义生成'

    appendStoredHistoryItem<ImageHistoryItem>(
      historyStorageKey,
      {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        image,
        promptLabel,
        contextPreview: contextText.trim().slice(0, 120),
        createdAt: Date.now(),
      },
      {
        maxItems: MAX_HISTORY_ITEMS,
        dedupe: (candidate, existing) => existing.image.url === candidate.image.url,
      },
    )
  }, [contextText, historyStorageKey, prompt, selectedActionConfig])

  useEffect(() => {
    if (!historyReady) return
    try {
      window.localStorage.setItem(
        historyStorageKey,
        JSON.stringify(historyItems.slice(0, MAX_HISTORY_ITEMS)),
      )
    } catch {}
  }, [historyItems, historyReady, historyStorageKey])

  useEffect(() => {
    if (!open) return
    const frame = window.requestAnimationFrame(() => {
      syncHistoryItems()
    })
    return () => window.cancelAnimationFrame(frame)
  }, [historyStorageKey, open, syncHistoryItems])

  useEffect(() => {
    const handleHistoryUpdated = (event: Event) => {
      const detail = (event as CustomEvent<{ storageKey?: string; items?: ImageHistoryItem[] }>).detail
      if (detail?.storageKey !== historyStorageKey || !Array.isArray(detail.items)) return
      setHistoryItems(detail.items.slice(0, MAX_HISTORY_ITEMS))
      setHistoryReady(true)
    }

    window.addEventListener(LOCAL_HISTORY_UPDATED_EVENT, handleHistoryUpdated)
    return () => window.removeEventListener(LOCAL_HISTORY_UPDATED_EVENT, handleHistoryUpdated)
  }, [historyStorageKey])

  useEffect(() => {
    if (!open) return

    const loadActions = async () => {
      try {
        const [actionsRes, profilesRes] = await Promise.all([
          fetch('/api/editor/ai-image-actions'),
          fetch('/api/admin/ai-image-provider'),
        ])

        const actionData = await actionsRes.json().catch(() => ({ actions: [] })) as { actions?: ImageActionItem[] }
        const profileData = await profilesRes.json().catch(() => ({ profiles: [], default_profile_id: null })) as {
          profiles?: ImageProfileItem[]
          default_profile_id?: number | null
        }

        const nextActions = Array.isArray(actionData.actions) ? actionData.actions : []
        const nextProfiles = Array.isArray(profileData.profiles) ? profileData.profiles : []
        const nextDefaultProfileId = Number.isFinite(profileData.default_profile_id)
          ? Number(profileData.default_profile_id)
          : nextProfiles.find((profile) => profile.is_default === 1)?.id ?? null
        const fallbackProfileId = nextDefaultProfileId ?? nextProfiles[0]?.id ?? null

        setActions(nextActions)
        setProfiles(nextProfiles)
        setSelectedAction('')
        setSelectedAspectRatio('auto')
        setSelectedResolution('2k')
        setSelectedProfileId(fallbackProfileId)
      } catch {
        setActions([])
        setProfiles([])
        setSelectedAction('')
        setSelectedAspectRatio('auto')
        setSelectedResolution('2k')
        setSelectedProfileId(null)
      }
    }

    void loadActions()
  }, [open])

  useEffect(() => {
    if (!open) return

    const frame = window.requestAnimationFrame(() => {
      setResult(null)
      setShowContext(false)
      setShowRevisedPrompt(false)
      setHistoryOpen(false)
      setGenerating(false)
      setSelectedAction('')
      setSelectedAspectRatio('auto')
      setSelectedResolution('2k')
      setPlacementMode(defaultPlacementMode)
      setTemplatesExpanded(false)
    })
    const timer = window.setTimeout(() => promptRef.current?.focus(), 50)

    return () => {
      window.cancelAnimationFrame(frame)
      window.clearTimeout(timer)
    }
  }, [defaultPlacementMode, open, referenceImageUrl])

  useEffect(() => {
    if (!open) return

    const previousOverflow = document.body.style.overflow
    const previousOverscroll = document.body.style.overscrollBehavior

    document.body.style.overflow = 'hidden'
    document.body.style.overscrollBehavior = 'none'

    return () => {
      document.body.style.overflow = previousOverflow
      document.body.style.overscrollBehavior = previousOverscroll
    }
  }, [open])

  useEffect(() => {
    if (!open) return

    const measureTemplates = () => {
      const node = templatesRef.current
      if (!node) return
      setTemplatesOverflowing(node.scrollHeight > TEMPLATE_COLLAPSED_HEIGHT + 2)
    }

    const frame = window.requestAnimationFrame(measureTemplates)
    window.addEventListener('resize', measureTemplates)

    return () => {
      window.cancelAnimationFrame(frame)
      window.removeEventListener('resize', measureTemplates)
    }
  }, [actions, open])

  const requestImage = useCallback(async () => {
    const res = await fetch('/api/editor/ai-image', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: selectedAction || 'custom',
        prompt: prompt.trim(),
        contextText: contextText.trim(),
        aspectRatio: selectedAspectRatio,
        resolution: selectedResolution,
        profileId: selectedProfileId,
        referenceImageUrl,
        inputFidelity: referenceImageUrl ? 'high' : undefined,
      }),
    })

    const data = await res.json().catch(() => ({})) as {
      error?: string
      image?: GeneratedImageResult
    }

    if (!res.ok || !data.image) {
      throw new Error(data.error || '图片生成失败')
    }

    return data.image
  }, [
    contextText,
    prompt,
    referenceImageUrl,
    selectedAction,
    selectedAspectRatio,
    selectedProfileId,
    selectedResolution,
  ])

  const handleGenerate = useCallback(async () => {
    if (!canGenerate || generating) return

    setResult(null)
    setShowRevisedPrompt(false)
    setHistoryOpen(false)

    if (closeOnGenerate) {
      onClose()
    }

    if (generationMode === 'background') {
      setGenerating(true)

      startBackgroundTask({
        toast,
        errorPrefix: '图片生成失败',
        run: requestImage,
        onSuccess: (image) => {
          storeHistoryItem(image)
          if (!closeOnGenerate) {
            setResult(image)
          }
        },
        onError: (message) => {
          if (!closeOnGenerate) {
            toast.error(message)
          }
        },
        onSettled: () => {
          setGenerating(false)
        },
      })
      return
    }

    try {
      setGenerating(true)
      const image = await requestImage()
      storeHistoryItem(image)
      setResult(image)
    } catch (nextError) {
      toast.error(nextError instanceof Error ? nextError.message : '图片生成失败')
    } finally {
      setGenerating(false)
    }
  }, [canGenerate, closeOnGenerate, generating, generationMode, onClose, requestImage, storeHistoryItem, toast])

  if (!open) return null

  return (
    <Dialog open={open} onClose={generating ? () => {} : onClose} className="relative z-[70]">
      <DialogBackdrop className="fixed inset-0 bg-black/45 transition duration-200 data-[closed]:opacity-0" />

      <div className="fixed inset-0 overflow-y-auto px-3 py-3 sm:px-4 sm:py-4">
        <div className="flex min-h-full items-center justify-center">
          <DialogPanel className="ui-modal-panel flex max-h-[calc(100vh-1.5rem)] w-full max-w-[1180px] flex-col overflow-hidden rounded-[2rem] transition duration-200 data-[closed]:scale-[0.985] data-[closed]:opacity-0">
            <div className="flex items-center justify-between gap-4 border-b border-[var(--ui-line)] px-5 py-4 sm:px-6">
              <DialogTitle as="h2" className="text-[15px] font-medium text-[var(--ui-ink)]">
                生成图片
              </DialogTitle>
              <UiIconButton
                onClick={onClose}
                tone="quiet"
                size="md"
                aria-label="关闭"
                className="text-[var(--ui-muted)]"
              >
                <X className="h-4 w-4" />
              </UiIconButton>
            </div>

            <div className="grid min-h-0 flex-1 lg:grid-cols-[minmax(0,0.96fr)_minmax(360px,1.04fr)]">
              <div className="min-h-0 border-b border-[var(--ui-line)] lg:border-b-0 lg:border-r">
                <div className="flex h-full min-h-0 flex-col">
                  <div className="modal-scrollbar-none min-h-0 flex-1 space-y-5 overflow-y-auto px-5 py-5 sm:px-6">
                    <section className="space-y-2.5">
                      <div className="text-[11px] font-medium tracking-[0.02em] text-[var(--ui-muted)]">
                        画面描述
                      </div>
                      <UiPanel className="relative rounded-[1.35rem] px-4 py-3.5">
                        <Sparkles className="pointer-events-none absolute left-4 top-4 h-4 w-4 text-[var(--ui-accent)]" />
                        <UiTextarea
                          ref={promptRef}
                          rows={3}
                          variant="composer"
                          value={prompt}
                          onChange={(event) => setPrompt(event.target.value)}
                          placeholder="例如：一个在暴雨里抬头看霓虹灯牌的孤独程序员，Mondo 风格，但不要在图里放文字"
                          className="min-h-[5.75rem] pl-7 pr-0 text-sm leading-6"
                        />
                      </UiPanel>
                    </section>

                    {referenceImageUrl ? (
                      <section className="space-y-2.5">
                        <div className="text-[11px] font-medium tracking-[0.02em] text-[var(--ui-muted)]">
                          参考图片
                        </div>
                        <UiPanel className="overflow-hidden rounded-[1.35rem] p-0">
                          <img
                            src={referenceImageUrl}
                            alt="参考图片"
                            className="aspect-[4/3] w-full object-cover"
                          />
                        </UiPanel>
                      </section>
                    ) : null}

                    <section className="space-y-2.5">
                      <div className="text-[11px] font-medium tracking-[0.02em] text-[var(--ui-muted)]">
                        快捷模板
                      </div>
                      <div
                        ref={templatesRef}
                        className={cx(
                          'flex flex-wrap gap-2 overflow-hidden',
                          !templatesExpanded && 'max-h-[42px]',
                        )}
                      >
                        <UiButton
                          tone={selectedAction === 'custom' ? 'soft' : 'quiet'}
                          size="sm"
                          onClick={() => setSelectedAction('custom')}
                          className={cx(
                            'rounded-full border px-3',
                            selectedAction === 'custom'
                              ? 'border-[color-mix(in_srgb,var(--ui-accent)_38%,var(--ui-line))] text-[var(--ui-accent)]'
                              : 'border-[color-mix(in_srgb,var(--ui-line)_88%,transparent)] text-[var(--ui-ink)]',
                          )}
                        >
                          自定义
                        </UiButton>
                        {actions.map((action) => (
                          <UiButton
                            key={action.id}
                            tone={selectedAction === action.action_key ? 'soft' : 'quiet'}
                            size="sm"
                            onClick={() => {
                              setSelectedAction(action.action_key)
                              setSelectedAspectRatio(action.aspect_ratio || 'auto')
                              setSelectedResolution(action.resolution || '2k')
                            }}
                            className={cx(
                              'rounded-full border px-3',
                              selectedAction === action.action_key
                                ? 'border-[color-mix(in_srgb,var(--ui-accent)_38%,var(--ui-line))] text-[var(--ui-accent)]'
                                : 'border-[color-mix(in_srgb,var(--ui-line)_88%,transparent)] text-[var(--ui-ink)]',
                            )}
                          >
                            {action.label}
                          </UiButton>
                        ))}
                      </div>
                      {templatesOverflowing ? (
                        <UiButton
                          tone="quiet"
                          size="sm"
                          onClick={() => setTemplatesExpanded((value) => !value)}
                          className="h-7 gap-1 px-0 text-[11px] text-[var(--ui-muted)]"
                        >
                          {templatesExpanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                          {templatesExpanded ? '收起' : '展开'}
                        </UiButton>
                      ) : null}
                    </section>

                    <section className="space-y-3 border-t border-[color-mix(in_srgb,var(--ui-line)_72%,transparent)] pt-4">
                      <div className="text-[11px] font-medium tracking-[0.02em] text-[var(--ui-muted)]">
                        生成设置
                      </div>
                      <div className="grid gap-3 sm:grid-cols-3">
                        <div className="space-y-1.5">
                          <div className="text-[11px] text-[var(--ui-muted)]">图片比例</div>
                          <SelectDropdown
                            options={aspectRatioOptions}
                            value={selectedAspectRatio}
                            onChange={(value) => setSelectedAspectRatio(value as AIImageAspectRatio)}
                            placeholder="选择比例"
                            menuPlacement="top"
                            className="w-full"
                          />
                        </div>
                        <div className="space-y-1.5">
                          <div className="text-[11px] text-[var(--ui-muted)]">分辨率</div>
                          <SelectDropdown
                            options={resolutionOptions}
                            value={selectedResolution}
                            onChange={(value) => setSelectedResolution(value as AIImageResolution)}
                            placeholder="选择分辨率"
                            menuPlacement="top"
                            className="w-full"
                          />
                        </div>
                        <div className="space-y-1.5">
                          <div className="text-[11px] text-[var(--ui-muted)]">模型</div>
                          <SelectDropdown
                            options={modelOptions}
                            value={selectedProfileId ? String(selectedProfileId) : ''}
                            onChange={(value) => {
                              setSelectedProfileId(value ? Number(value) : null)
                            }}
                            placeholder="搜索并选择图片模型"
                            menuPlacement="top"
                            className="w-full"
                            searchable
                          />
                        </div>
                      </div>
                    </section>

                    {allowReplace ? (
                      <section className="space-y-2.5">
                        <div className="text-[11px] font-medium tracking-[0.02em] text-[var(--ui-muted)]">
                          生成后动作
                        </div>
                        <UiPanel inset="soft" className="grid grid-cols-2 gap-1 rounded-[1.1rem] p-1">
                          <UiButton
                            tone={placementMode === 'replace' ? 'soft' : 'quiet'}
                            size="md"
                            fullWidth
                            onClick={() => setPlacementMode('replace')}
                            className={cx(
                              'rounded-[0.9rem]',
                              placementMode === 'replace' && 'text-[var(--ui-ink)]',
                            )}
                          >
                            替换当前图
                          </UiButton>
                          <UiButton
                            tone={placementMode === 'insert' ? 'soft' : 'quiet'}
                            size="md"
                            fullWidth
                            onClick={() => setPlacementMode('insert')}
                            className={cx(
                              'rounded-[0.9rem]',
                              placementMode === 'insert' && 'text-[var(--ui-ink)]',
                            )}
                          >
                            插入新图
                          </UiButton>
                        </UiPanel>
                      </section>
                    ) : null}

                    {contextPreview ? (
                      <section className="space-y-2.5">
                        <UiButton
                          tone="quiet"
                          fullWidth
                          onClick={() => setShowContext((value) => !value)}
                          className="h-auto justify-between rounded-[1.2rem] border border-[color-mix(in_srgb,var(--ui-line)_88%,transparent)] px-4 py-3 text-left"
                        >
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center justify-between gap-3">
                              <div className="text-[11px] font-medium tracking-[0.02em] text-[var(--ui-muted)]">
                                选中文本
                              </div>
                              <div className="shrink-0 text-[11px] text-[var(--ui-muted)]">
                                {contextCharCount} 字
                              </div>
                            </div>
                            <div className="mt-1 line-clamp-2 text-sm leading-6 text-[var(--ui-ink)]">
                              {contextPreview}
                            </div>
                          </div>
                          {showContext ? (
                            <ChevronUp className="mt-0.5 h-4 w-4 shrink-0 text-[var(--ui-muted)]" />
                          ) : (
                            <ChevronDown className="mt-0.5 h-4 w-4 shrink-0 text-[var(--ui-muted)]" />
                          )}
                        </UiButton>
                        {showContext ? (
                          <UiPanel inset="soft" className="rounded-[1.2rem] px-4 py-3">
                            <pre className="whitespace-pre-wrap text-xs leading-6 text-[var(--ui-ink)]">
                              {contextPreview}
                            </pre>
                          </UiPanel>
                        ) : null}
                      </section>
                    ) : null}
                  </div>

                  <div className="border-t border-[var(--ui-line)] px-5 py-4 sm:px-6">
                    <div className="flex items-center justify-end gap-3">
                      <UiButton
                        tone="solid"
                        size="md"
                        onClick={() => void handleGenerate()}
                        disabled={!canGenerate || generating}
                        className="px-4"
                      >
                        {generating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                        {result ? '重新生成' : '开始生成'}
                      </UiButton>
                    </div>
                  </div>
                </div>
              </div>

              <div className="min-h-0">
                <div className="flex h-full min-h-0 flex-col">
                  <div className="flex items-center justify-between gap-3 border-b border-[var(--ui-line)] px-5 py-4 sm:px-6">
                    <div className="text-[11px] font-medium tracking-[0.02em] text-[var(--ui-muted)]">
                      {historyOpen ? '最近生成' : '生成结果'}
                    </div>
                    {historyItems.length > 0 ? (
                      <UiButton
                        tone="quiet"
                        size="sm"
                        onClick={() => setHistoryOpen((value) => !value)}
                        className="rounded-full border border-[var(--ui-line)] px-2.5 text-[11px] text-[var(--ui-ink)]"
                      >
                        <History className="h-3.5 w-3.5" />
                        {historyOpen ? '返回结果' : '最近生成'}
                      </UiButton>
                    ) : null}
                  </div>

                  <div className="modal-scrollbar-none min-h-0 flex-1 overflow-y-auto px-5 py-5 sm:px-6">
                    {historyOpen && historyItems.length > 0 ? (
                      <div className="grid gap-3 sm:grid-cols-2">
                        {historyItems.map((item) => {
                          const previewUrl = item.image.variants?.content || item.image.url
                          return (
                            <UiPanel
                              key={item.id}
                              className="overflow-hidden rounded-[1.25rem] p-0"
                            >
                              <UiButton
                                tone="quiet"
                                fullWidth
                                onClick={() => {
                                  setResult(item.image)
                                  setHistoryOpen(false)
                                  setShowRevisedPrompt(false)
                                }}
                                className="h-auto rounded-none p-0"
                              >
                                <img
                                  src={previewUrl}
                                  alt={item.image.alt}
                                  className="aspect-[4/3] w-full object-cover"
                                />
                              </UiButton>
                              <div className="space-y-2 px-3 py-3">
                                <div className="line-clamp-2 text-sm font-medium leading-6 text-[var(--ui-ink)]">
                                  {item.promptLabel}
                                </div>
                                <div className="text-[11px] leading-5 text-[var(--ui-muted)]">
                                  {item.contextPreview || '来自最近生成'}
                                </div>
                                <div className="flex items-center justify-between gap-2">
                                  <span className="text-[11px] text-[var(--ui-muted)]">
                                    {formatHistoryTime(item.createdAt)}
                                  </span>
                                  <UiButton
                                    tone="quiet"
                                    size="sm"
                                    onClick={() => onInsert(item.image.url, item.image.alt, placementMode)}
                                    className="rounded-lg border border-[var(--ui-line)] px-2.5 text-[11px] text-[var(--ui-ink)]"
                                  >
                                    <Check className="h-3.5 w-3.5" />
                                    {placementMode === 'replace' ? '替换' : '插入'}
                                  </UiButton>
                                </div>
                              </div>
                            </UiPanel>
                          )
                        })}
                      </div>
                    ) : generating ? (
                      <UiPanel
                        inset="soft"
                        className="flex min-h-[320px] items-center justify-center rounded-[1.35rem] border-dashed text-sm text-[var(--ui-muted)]"
                      >
                        <div className="flex items-center gap-2">
                          <Loader2 className="h-4 w-4 animate-spin" />
                          AI 正在生成图片…
                        </div>
                      </UiPanel>
                    ) : result ? (
                      <div className="flex h-full min-h-0 flex-col gap-4">
                        <UiPanel className="overflow-hidden rounded-[1.35rem] p-0">
                          <img
                            src={result.variants?.content || result.url}
                            alt={result.alt}
                            className="h-auto w-full object-cover"
                          />
                        </UiPanel>

                        <div className="space-y-3 border-t border-[color-mix(in_srgb,var(--ui-line)_72%,transparent)] pt-1">
                          <div className="text-[11px] font-medium tracking-[0.02em] text-[var(--ui-muted)]">
                            ALT
                          </div>
                          <div className="text-sm leading-6 text-[var(--ui-ink)]">
                            {result.alt}
                          </div>

                          <div className="flex flex-wrap gap-2 text-[11px] text-[var(--ui-muted)]">
                            <UiPanel className="rounded-full px-2.5 py-1">
                              比例：{getAiImageAspectRatioLabel(result.aspectRatio)}
                            </UiPanel>
                            <UiPanel className="rounded-full px-2.5 py-1">
                              分辨率：{getAiImageResolutionLabel(result.resolution)}
                            </UiPanel>
                            <UiPanel className="rounded-full px-2.5 py-1">
                              模型：{`${result.profileName} · ${result.model}`}
                            </UiPanel>
                          </div>

                          {result.revisedPrompt ? (
                            <div className="space-y-2">
                              <UiButton
                                tone="quiet"
                                size="sm"
                                onClick={() => setShowRevisedPrompt((value) => !value)}
                                className="h-7 gap-1 px-0 text-[11px] text-[var(--ui-muted)]"
                              >
                                {showRevisedPrompt ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                                查看润色后的提示词
                              </UiButton>
                              {showRevisedPrompt ? (
                                <UiPanel inset="soft" className="rounded-xl px-3 py-3">
                                  <div className="whitespace-pre-wrap text-xs leading-6 text-[var(--ui-ink)]">
                                    {result.revisedPrompt}
                                  </div>
                                </UiPanel>
                              ) : null}
                            </div>
                          ) : null}
                        </div>

                        <div className="mt-auto flex justify-end gap-2">
                          <UiButton
                            tone="quiet"
                            size="md"
                            onClick={onClose}
                            className="border border-[var(--ui-line)] px-4 text-[var(--ui-ink)]"
                          >
                            关闭
                          </UiButton>
                          <UiButton
                            tone="solid"
                            size="md"
                            onClick={() => onInsert(result.url, result.alt, placementMode)}
                            className="px-4"
                          >
                            {placementMode === 'replace' ? '替换当前图' : '插入正文'}
                          </UiButton>
                        </div>
                      </div>
                    ) : (
                      <UiPanel
                        inset="soft"
                        className="flex min-h-[320px] items-center justify-center rounded-[1.35rem] border-dashed"
                      >
                        <div className="flex flex-col items-center gap-3 text-[var(--ui-muted)] opacity-60">
                          <ImageIcon className="h-11 w-11" />
                        </div>
                      </UiPanel>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </DialogPanel>
        </div>
      </div>
    </Dialog>
  )
}

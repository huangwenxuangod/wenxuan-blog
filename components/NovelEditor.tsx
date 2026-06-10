'use client'

import dynamic from 'next/dynamic'
import Link from 'next/link'
import { Menu, MenuButton, MenuItem, MenuItems, Dialog, DialogBackdrop, DialogTitle, DialogPanel } from '@headlessui/react'
import { useEffect, useRef, useState, useCallback, useMemo } from 'react'
import {
  ArrowLeft,
  Bot,
  ChevronUp,
  Plus,
  Palette,
  Globe,
  Eye as EyeIcon,
  Lock,
  Link2,
  Copy,
  Smartphone,
  FileDown,
  Send,
  PanelRightOpen,
  PanelRightClose,
  PanelLeftOpen,
  PanelLeftClose,
  ListTree,
  ScrollText,
  Share2,
  Image as ImageIcon,
  Settings,
  Sparkles,
  Upload,
  Trash2,
  X,
  Loader2,
} from 'lucide-react'
import {
  EditorContent,
  EditorInstance,
  EditorRoot,
  JSONContent,
} from 'novel'
import {
  createEditorExtensions,
  buildEditorProps,
  FormattingBubble,
  SlashMenu,
} from '@/lib/editor-extensions'
import { generatePassword } from '@/lib/password'
import { InputModal } from '@/components/InputModal'
import { EditorRightRail } from '@/components/editor/EditorRightRail'
import { EditorTocRail } from '@/components/editor/EditorTocRail'
import { useToast } from '@/components/Toast'
import { AdminThemeToggle } from '@/components/AdminThemeToggle'
import { Tooltip } from '@/components/ui/Tooltip'
import {
  COVER_IMAGE_OPTIMIZE_OPTIONS,
  EDITOR_IMAGE_OPTIMIZE_OPTIONS,
  optimizeImageForUpload,
} from '@/lib/client-image'
import {
  createUploadPlaceholderMarker,
  insertGeneratedImageAfterNode,
  insertGeneratedImageAtPosition,
  insertUploadPlaceholder,
  insertUploadedFileIntoEditor,
  removeUploadPlaceholder,
  replaceImageNodeAtPosition,
  uploadEditorFile,
} from '@/lib/editor-file-upload'
import {
  extractFilesFromClipboard,
  useEditorAuxiliaryModals,
  useEditorUploadTriggers,
} from '@/lib/editor-ui'
import type { EditorImageActionTarget } from '@/lib/resizable-image'
import { resolvePostCoverImage } from '@/lib/default-cover-images'
import { buildAutoDescription, normalizePostSlug } from '@/lib/post-utils'
import { getSiteDisplayUrl, getSiteUrl } from '@/lib/site-config'
import { resizeTextareaHeight, useAutoResizeTextarea } from '@/lib/textarea-autosize'
import { UiButton, UiIconButton, UiPanel, UiTextarea, cx } from '@/components/ui/primitives'
import { fetchAdminCategories, normalizeVisibleCategories, type ClientCategory } from '@/lib/categories-client'
import {
  buildDocumentContextText,
  extractTitleCandidate,
  readAiTextResponse,
  TITLE_GENERATION_PROMPT,
} from '@/lib/ai-modal'
import type { RuntimeCapabilities } from '@/lib/runtime-capabilities'
import { resolveEditorRailLayout } from '@/lib/editor-responsive-layout'
import {
  normalizeWechatStylePreset,
  WECHAT_STYLE_PRESET_OPTIONS,
  WECHAT_STYLE_STORAGE_KEY,
  type WechatStylePresetId,
} from '@/lib/wechat/style-presets'

type PublishStatus = 'public' | 'draft' | 'encrypted' | 'unlisted'
type SaveState = 'saved' | 'dirty' | 'saving' | 'error'

const TOC_KEY = 'qmblog:toc-open'
const LEFT_RAIL_MODE_KEY = 'qmblog:left-rail-mode'
const AI_RAIL_KEY = 'qmblog:ai-rail-open'
const AI_RAIL_WIDTH_KEY = 'qmblog:ai-rail-width'
const AUTOSAVE_DEBOUNCE_MS = 1500
const AUTOSAVE_MAX_RETRY_DELAY_MS = 10000
const SITE_DISPLAY_URL = getSiteDisplayUrl()
const DEFAULT_AI_RAIL_WIDTH = 372
const MIN_AI_RAIL_WIDTH = 320
const MAX_AI_RAIL_WIDTH = 640

const AIPanel = dynamic(
  () => import('@/components/editor/AIPanel').then((module) => ({ default: module.AIPanel })),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-full items-center justify-center text-sm text-[var(--editor-muted)]">
        AI 面板加载中...
      </div>
    ),
  },
)

const AIModal = dynamic(
  () => import('@/lib/ai-modal').then((module) => ({ default: module.AIModal })),
  {
    ssr: false,
  },
)

const ImageGenerationModal = dynamic(
  () => import('@/components/ImageGenerationModal').then((module) => ({ default: module.ImageGenerationModal })),
  {
    ssr: false,
  },
)

const ImageCropModal = dynamic(
  () => import('@/components/ImageCropModal').then((module) => ({ default: module.ImageCropModal })),
  {
    ssr: false,
  },
)

const WeChatPublishModal = dynamic(
  () => import('@/components/WeChatPublishModal').then((module) => ({ default: module.WeChatPublishModal })),
  {
    ssr: false,
  },
)

const ShareLongImageModal = dynamic(
  () => import('@/components/ShareLongImageModal').then((module) => ({ default: module.ShareLongImageModal })),
  {
    ssr: false,
  },
)

const SettingsManager = dynamic(
  () => import('@/app/admin/(protected)/settings/SettingsManager').then((module) => ({ default: module.SettingsManager })),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-96 items-center justify-center text-sm text-[var(--editor-muted)]">
        <Loader2 className="h-5 w-5 animate-spin mr-2" />
        加载设置中...
      </div>
    ),
  },
)

const EMPTY_DOCUMENT = {
  type: 'doc',
  content: [{ type: 'paragraph' }],
} satisfies JSONContent

function relativeTime(ts: number): string {
  const diff = Math.floor((Date.now() - ts) / 1000)
  if (diff < 60) return '刚刚'
  if (diff < 3600) return `${Math.floor(diff / 60)}分钟前`
  return `${Math.floor(diff / 3600)}小时前`
}

interface NovelEditorProps {
  initialData?: {
    slug: string
    title: string
    html: string
    category?: string
    status?: 'draft' | 'published' | 'deleted'
    password?: string | null
    is_hidden?: number
    tags?: string[]
    description?: string | null
    cover_image?: string | null
  }
  initialCategory?: string
}

type DraftMetaState = {
  editSlug: string | null
  slug: string
  category: string
  tags: string[]
  description: string
  coverImage: string
}

type RightRailMode = 'chat' | 'wechat-preview'
type LeftRailMode = 'toc' | 'articles'

type SettingsCategory = {
  name: string
  slug: string
  post_count: number
}

type SettingsTabId =
  | 'nav'
  | 'categories'
  | 'code'
  | 'theme'
  | 'preferences'
  | 'tokens'
  | 'ai-provider'
  | 'ai-actions'
  | 'skills'
  | 'ai-image-provider'
  | 'ai-image-actions'
  | 'ai-post-generators'
  | 'runtime'
  | 'backup'

function WechatPreviewRail({
  title,
  html,
  stylePreset,
}: {
  title: string
  html: string
  stylePreset: WechatStylePresetId
}) {
  const [previewHtml, setPreviewHtml] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const buildPreview = useCallback(async () => {
    setLoading(true)
    setError('')

    try {
      const { buildWechatPreviewHtml } = await import('@/lib/wechat/copy')
      setPreviewHtml(buildWechatPreviewHtml(title, html, stylePreset))
    } catch (buildError) {
      setPreviewHtml('')
      setError(buildError instanceof Error ? buildError.message : '生成公众号预览失败')
    } finally {
      setLoading(false)
    }
  }, [html, stylePreset, title])

  useEffect(() => {
    void buildPreview()
  }, [buildPreview])

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-[var(--editor-muted)]">
        AI 面板加载中...
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex h-full items-center justify-center px-5 text-center text-sm text-[var(--ui-danger)]">
        {error}
      </div>
    )
  }

  return (
    <div className="h-full min-h-0">
      <iframe
        title="公众号预览"
        srcDoc={previewHtml}
        className="h-full w-full border-0 bg-white"
      />
    </div>
  )
}

export function NovelEditor({ initialData, initialCategory }: NovelEditorProps = {}) {
  // ── Core state ──
  const [draftReady, setDraftReady] = useState(false)
  const [initialContent, setInitialContent] = useState<JSONContent>(EMPTY_DOCUMENT)
  const editorRef = useRef<EditorInstance | null>(null)
  const mainScrollRef = useRef<HTMLElement | null>(null)
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const fileUploadRef = useRef<HTMLInputElement | null>(null)

  // ── Fields ──
  const [editSlug, setEditSlug] = useState(initialData?.slug ?? null)
  const [title, setTitle] = useState('')
  const latestTitleRef = useRef('')
  const [charCount, setCharCount] = useState(0)
  const [category] = useState(initialData?.category || initialCategory || 'AI')
  const [publishStatus, setPublishStatus] = useState<PublishStatus>(
    initialData?.status === 'draft' ? 'draft' :
    initialData?.password ? 'encrypted' :
    initialData?.is_hidden ? 'unlisted' : 'public'
  )
  const [tags] = useState<string[]>(initialData?.tags || [])
  const [description, setDescription] = useState(initialData?.description || '')
  const [coverImage, setCoverImage] = useState(initialData?.cover_image || '')
  const [slug, setSlug] = useState(initialData?.slug || '')

  // ── UI state ──
  const [tocOpen, setTocOpen] = useState(true)
  const [leftRailMode, setLeftRailMode] = useState<LeftRailMode>('toc')
  const [aiRailOpen, setAiRailOpen] = useState(true)
  const [aiRailWidth, setAiRailWidth] = useState(DEFAULT_AI_RAIL_WIDTH)
  const [viewportWidth, setViewportWidth] = useState(0)
  const [rightRailMode, setRightRailMode] = useState<RightRailMode>('chat')
  const [wechatStylePreset, setWechatStylePreset] = useState<WechatStylePresetId>('default')
  const [publishPanelOpen, setPublishPanelOpen] = useState(false)
  const [wechatPublishOpen, setWechatPublishOpen] = useState(false)
  const [shareLongImageOpen, setShareLongImageOpen] = useState(false)
  const [settingsModalOpen, setSettingsModalOpen] = useState(false)
  const [settingsActiveTab, setSettingsActiveTab] = useState<SettingsTabId>('nav')
  const [providerRefreshKey, setProviderRefreshKey] = useState(0)
  const [homeShortcutEnabled, setHomeShortcutEnabled] = useState(true)
  const [settingsLoading, setSettingsLoading] = useState(false)
  const [editorCategories, setEditorCategories] = useState<ClientCategory[]>([])
  const [settingsData, setSettingsData] = useState<{
    navLinks: string
    customJs: string
    categories: SettingsCategory[]
    bodyFont: string
    defaultTheme: string
    runtimeCapabilities: RuntimeCapabilities
    homeShortcutEnabled: string
  } | null>(null)

  useEffect(() => {
    fetch('/api/admin/settings?key=home_shortcut_enabled')
      .then((res) => res.json())
      .then((data: { value?: string }) => {
        if (data && data.value !== undefined) {
          setHomeShortcutEnabled(data.value === 'true')
        }
      })
      .catch(() => {})
  }, [])

  useEffect(() => {
    let active = true

    void fetchAdminCategories()
      .then((categories) => {
        if (active) setEditorCategories(categories)
      })
      .catch(() => {})

    return () => {
      active = false
    }
  }, [])

  const openSettingsModal = async (tabId: SettingsTabId = 'nav') => {
    setSettingsActiveTab(tabId)
    setSettingsModalOpen(true)
    if (settingsData) return

    setSettingsLoading(true)
    try {
      const [settingsRes, categoriesRes] = await Promise.all([
        fetch('/api/admin/settings'),
        fetch('/api/admin/categories')
      ])

      const settingsJson = await settingsRes.json()
      const categoriesJson = await categoriesRes.json()

      setSettingsData({
        navLinks: settingsJson.nav_links || '',
        customJs: settingsJson.custom_js || '',
        categories: categoriesJson.categories || [],
        bodyFont: settingsJson.body_font || '',
        defaultTheme: settingsJson.default_theme || '',
        homeShortcutEnabled: settingsJson.home_shortcut_enabled || 'true',
        runtimeCapabilities: {
          bindings: {
            d1: true,
            cache: false,
            images: true,
            queue: false,
            workersAI: true,
            vectorize: false,
          },
          features: {
            asyncJobs: {
              enabled: false,
              strategy: 'inline',
              note: '',
            },
            aiInference: {
              enabled: true,
              strategy: 'workers-ai',
              note: '',
            },
            mediaPipeline: {
              enabled: true,
              strategy: 'client',
              note: '',
            },
            relatedContent: {
              enabled: true,
              strategy: 'fts',
              note: '',
            },
          },
        }
      })
    } catch (err) {
      console.error('Failed to load settings', err)
      toast.error('获取系统设置失败，请重试')
    } finally {
      setSettingsLoading(false)
    }
  }

  const handleOpenSettings = () => {
    void openSettingsModal()
  }
  const createCategoryOptions = useMemo(
    () => normalizeVisibleCategories(settingsData?.categories ?? editorCategories),
    [editorCategories, settingsData?.categories],
  )
  const [saving, setSaving] = useState(false)
  const [uploadingImage, setUploadingImage] = useState(false)
  const [uploadProgress, setUploadProgress] = useState(0)
  const [generatingCover, setGeneratingCover] = useState(false)
  const [generatingTitle, setGeneratingTitle] = useState(false)
  const [titleToolsVisible, setTitleToolsVisible] = useState(false)
  const [saveState, setSaveState] = useState<SaveState>('saved')
  const [lastSavedAt, setLastSavedAt] = useState<number>(Date.now())
  const [referenceImageTarget, setReferenceImageTarget] = useState<EditorImageActionTarget | null>(null)
  const [cropImageTarget, setCropImageTarget] = useState<EditorImageActionTarget | null>(null)
  const [, setTick] = useState(0) // force re-render for relative time
  const publishPanelRef = useRef<HTMLDivElement>(null)
  const titleRef = useRef<HTMLTextAreaElement>(null)
  const titleToolsHideTimerRef = useRef<number | null>(null)
  const toast = useToast()

  // Draft save refs
  const draftSaveTimerRef = useRef<number | null>(null)
  const retrySaveTimerRef = useRef<number | null>(null)
  const autosaveAbortRef = useRef<AbortController | null>(null)
  const autosaveSeqRef = useRef(0)
  const lastAutosaveSnapshotRef = useRef<string | null>(null)
  const activeDocumentSlugRef = useRef<string | null>(initialData?.slug ?? null)
  const skipNextEditorUpdateRef = useRef(Boolean(initialData?.html))
  const slugInputFocusedRef = useRef(false)
  const latestMetaRef = useRef<DraftMetaState>({
    editSlug: initialData?.slug ?? null,
    slug: initialData?.slug || '',
    category: initialData?.category || 'AI',
    tags: initialData?.tags || [],
    description: initialData?.description || '',
    coverImage: initialData?.cover_image || '',
  })

  // ── Init ──
  useEffect(() => {
    if (initialData) {
      latestTitleRef.current = initialData.title
      setTitle(initialData.title)
      setInitialContent(EMPTY_DOCUMENT)
    } else {
      // 新文章，使用空文档
      setInitialContent(EMPTY_DOCUMENT)
    }
    setDraftReady(true)

    // Load rail preferences
    if (typeof window !== 'undefined') {
      setViewportWidth(window.innerWidth)
      const storedToc = window.localStorage.getItem(TOC_KEY)
      setTocOpen(storedToc === null ? true : storedToc === 'true')
      const storedLeftRailMode = window.localStorage.getItem(LEFT_RAIL_MODE_KEY)
      setLeftRailMode(storedLeftRailMode === 'articles' ? 'articles' : 'toc')
      const storedAiRail = window.localStorage.getItem(AI_RAIL_KEY)
      setAiRailOpen(storedAiRail === null ? true : storedAiRail === 'true')
      setWechatStylePreset(normalizeWechatStylePreset(window.localStorage.getItem(WECHAT_STYLE_STORAGE_KEY)))
      const storedAiRailWidth = Number(window.localStorage.getItem(AI_RAIL_WIDTH_KEY) || '')
      if (Number.isFinite(storedAiRailWidth) && storedAiRailWidth > 0) {
        setAiRailWidth(Math.min(MAX_AI_RAIL_WIDTH, Math.max(MIN_AI_RAIL_WIDTH, storedAiRailWidth)))
      }
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (typeof window === 'undefined') return

    const syncRailLayout = () => {
      setViewportWidth(window.innerWidth)
    }

    syncRailLayout()
    window.addEventListener('resize', syncRailLayout)
    return () => window.removeEventListener('resize', syncRailLayout)
  }, [])

  // Persist rail preferences
  useEffect(() => {
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(TOC_KEY, String(tocOpen))
      window.localStorage.setItem(LEFT_RAIL_MODE_KEY, leftRailMode)
      window.localStorage.setItem(AI_RAIL_KEY, String(aiRailOpen))
      window.localStorage.setItem(AI_RAIL_WIDTH_KEY, String(aiRailWidth))
      window.localStorage.setItem(WECHAT_STYLE_STORAGE_KEY, wechatStylePreset)
    }
  }, [aiRailOpen, aiRailWidth, leftRailMode, tocOpen, wechatStylePreset])

  useEffect(() => {
    latestMetaRef.current = {
      editSlug,
      slug,
      category,
      tags,
      description,
      coverImage,
    }
  }, [editSlug, slug, category, tags, description, coverImage])

  const buildAutosaveSnapshot = useCallback((payload: {
    currentSlug: string | null
    nextSlug: string
    title: string
    html: string
    description: string
    category: string
    tags: string[]
    coverImage: string
  }) => {
    return JSON.stringify({
      currentSlug: payload.currentSlug,
      nextSlug: payload.nextSlug,
      title: payload.title,
      html: payload.html,
      description: payload.description,
      category: payload.category,
      tags: payload.tags,
      coverImage: payload.coverImage,
    })
  }, [])

  const clearAutosaveTimers = useCallback(() => {
    if (draftSaveTimerRef.current !== null) {
      window.clearTimeout(draftSaveTimerRef.current)
      draftSaveTimerRef.current = null
    }
    if (retrySaveTimerRef.current !== null) {
      window.clearTimeout(retrySaveTimerRef.current)
      retrySaveTimerRef.current = null
    }
  }, [])

  const abortAutosaveRequest = useCallback(() => {
    autosaveAbortRef.current?.abort()
    autosaveAbortRef.current = null
  }, [])

  useEffect(() => {
    activeDocumentSlugRef.current = initialData?.slug ?? null
    clearAutosaveTimers()
    abortAutosaveRequest()
    autosaveSeqRef.current += 1
    lastAutosaveSnapshotRef.current = initialData?.slug
      ? buildAutosaveSnapshot({
          currentSlug: initialData.slug,
          nextSlug: initialData.slug,
          title: initialData.title || '无标题',
          html: initialData.html || '',
          description: (initialData.description || '').trim(),
          category: initialData.category || 'AI',
          tags: initialData.tags || [],
          coverImage: initialData.cover_image || '',
        })
      : null
    setSaveState('saved')
    setLastSavedAt(Date.now())
  }, [abortAutosaveRequest, buildAutosaveSnapshot, clearAutosaveTimers, initialData])

  useEffect(() => {
    clearAutosaveTimers()
    abortAutosaveRequest()
    autosaveSeqRef.current += 1
    lastAutosaveSnapshotRef.current = initialData?.slug
      ? buildAutosaveSnapshot({
          currentSlug: initialData.slug,
          nextSlug: initialData.slug,
          title: initialData.title || '无标题',
          html: initialData.html || '',
          description: (initialData.description || '').trim(),
          category: initialData.category || 'AI',
          tags: initialData.tags || [],
          coverImage: initialData.cover_image || '',
        })
      : null
    setSaveState('saved')
    setLastSavedAt(Date.now())
  }, [abortAutosaveRequest, buildAutosaveSnapshot, clearAutosaveTimers, initialData])

  // Relative time ticker
  useEffect(() => {
    const id = window.setInterval(() => setTick(t => t + 1), 30000)
    return () => clearInterval(id)
  }, [title])

  // Cleanup timers
  useEffect(() => {
    return () => {
      if (draftSaveTimerRef.current !== null) window.clearTimeout(draftSaveTimerRef.current)
      if (retrySaveTimerRef.current !== null) window.clearTimeout(retrySaveTimerRef.current)
      if (titleToolsHideTimerRef.current !== null) window.clearTimeout(titleToolsHideTimerRef.current)
      autosaveAbortRef.current?.abort()
    }
  }, [title])

  // Auto-focus title on new post
  useEffect(() => {
    if (draftReady && !editSlug && titleRef.current) {
      titleRef.current.focus()
    }
  }, [draftReady, editSlug])

  // Click outside to close publish panel
  useEffect(() => {
    if (!publishPanelOpen) return
    const handler = (e: MouseEvent) => {
      if (publishPanelRef.current && !publishPanelRef.current.contains(e.target as Node)) {
        setPublishPanelOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [publishPanelOpen])

  const activeKeys = useRef<Set<string>>(new Set())
  const homeShortcutEnabledRef = useRef(homeShortcutEnabled)
  useEffect(() => {
    homeShortcutEnabledRef.current = homeShortcutEnabled
  }, [homeShortcutEnabled])

  // Keyboard shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 's') {
        e.preventDefault()
        handleSave()
      }
      if (e.key === 'Escape') {
        setPublishPanelOpen(false)
      }

      if (homeShortcutEnabledRef.current) {
        activeKeys.current.add(e.code)

        if (e.key === 'Home') {
          const hasLeft =
            activeKeys.current.has('ArrowLeft') ||
            activeKeys.current.has('AltLeft') ||
            activeKeys.current.has('ControlLeft') ||
            activeKeys.current.has('ShiftLeft')

          const hasRight =
            activeKeys.current.has('ArrowRight') ||
            activeKeys.current.has('AltRight') ||
            activeKeys.current.has('ControlRight') ||
            activeKeys.current.has('ShiftRight')

          if (hasLeft) {
            e.preventDefault()
            setTocOpen((prev) => !prev)
          } else if (hasRight) {
            e.preventDefault()
            setAiRailOpen((prev) => !prev)
          }
        }
      }
    }

    const keyupHandler = (e: KeyboardEvent) => {
      activeKeys.current.delete(e.code)
    }

    const blurHandler = () => {
      activeKeys.current.clear()
    }

    document.addEventListener('keydown', handler)
    document.addEventListener('keyup', keyupHandler)
    window.addEventListener('blur', blurHandler)

    return () => {
      document.removeEventListener('keydown', handler)
      document.removeEventListener('keyup', keyupHandler)
      window.removeEventListener('blur', blurHandler)
    }
  }, [])

  const {
    aiModal,
    closeAiModal,
    closeImageModal,
    handleInputModalCancel,
    handleInputModalConfirm,
    imageModal,
    inputModal,
  } = useEditorAuxiliaryModals({
    title,
    getDocumentText: () => editorRef.current?.getText({ blockSeparator: '\n\n' }).trim() || '',
    getSelectionContext: () => {
      const selection = editorRef.current?.state.selection
      return {
        insertPos: selection?.to ?? null,
        selectedText: selection
          ? editorRef.current?.state.doc.textBetween(selection.from, selection.to, '\n').trim() || ''
          : '',
      }
    },
  })

  useEditorUploadTriggers(fileInputRef, fileUploadRef)

  const insertGeneratedImage = useCallback((imageUrl: string, alt: string) => {
    const editor = editorRef.current
    if (!editor) return

    insertGeneratedImageAtPosition(editor, imageUrl, alt, imageModal.insertPos)
    closeImageModal()
  }, [closeImageModal, imageModal.insertPos])

  const applyImageActionResult = useCallback((
    target: EditorImageActionTarget,
    imageUrl: string,
    alt: string,
    placementMode: 'insert' | 'replace' = 'replace',
  ) => {
    const editor = editorRef.current
    if (!editor) return

    const nextAlt = alt || target.alt || ''

    if (placementMode === 'replace') {
      replaceImageNodeAtPosition(editor, imageUrl, nextAlt, target.pos)
    } else {
      insertGeneratedImageAfterNode(editor, imageUrl, nextAlt, target.pos)
    }
  }, [])

  const syncPersistedSlug = useCallback((
    persistedSlug: string,
    previousSlug: string | null,
    forceVisibleSync = false,
  ) => {
    const shouldSyncVisibleSlug = forceVisibleSync
      || !slugInputFocusedRef.current
      || latestMetaRef.current.slug === persistedSlug

    latestMetaRef.current = {
      ...latestMetaRef.current,
      editSlug: persistedSlug,
      slug: shouldSyncVisibleSlug ? persistedSlug : latestMetaRef.current.slug,
    }
    activeDocumentSlugRef.current = persistedSlug

    setEditSlug(persistedSlug)
    if (shouldSyncVisibleSlug) {
      setSlug(persistedSlug)
    }

    if (persistedSlug !== previousSlug) {
      window.history.replaceState({}, '', `/editor?edit=${encodeURIComponent(persistedSlug)}`)
    }
  }, [])

  const persistDraft = useCallback(async (
    nextTitle = latestTitleRef.current,
    editor = editorRef.current,
    retryAttempt = 0,
  ) => {
    if (typeof window === 'undefined' || !draftReady || !editor) return

    const { editSlug: currentSlug, slug: nextSlugRaw, category, tags, description, coverImage } = latestMetaRef.current
    if (activeDocumentSlugRef.current !== currentSlug) return

    const nextSlug = normalizePostSlug(nextSlugRaw)
    const normalizedTitle = nextTitle.trim() || '无标题'
    const contentJson = editor.getJSON()
    const html = editor.getHTML()
    const plainText = editor.getText({ blockSeparator: '\n\n' }).trim()
    const hasMedia = /<(img|video|audio|iframe)\b/i.test(html)
    const hasMeaningfulContent = Boolean(nextTitle.trim() || plainText || hasMedia)

    if (!hasMeaningfulContent) {
      setSaveState('saved')
      return
    }

    const normalizedDescription = (description || buildAutoDescription(plainText) || '').trim()
    const snapshot = buildAutosaveSnapshot({
      currentSlug,
      nextSlug,
      title: normalizedTitle,
      html,
      description: normalizedDescription,
      category,
      tags,
      coverImage,
    })

    if (snapshot === lastAutosaveSnapshotRef.current) {
      setSaveState('saved')
      return
    }

    const requestId = autosaveSeqRef.current + 1
    autosaveSeqRef.current = requestId

    abortAutosaveRequest()
    const controller = new AbortController()
    autosaveAbortRef.current = controller

    setSaveState('saving')

    try {
      if (currentSlug) {
        const res = await fetch('/api/posts', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            current_slug: currentSlug,
            new_slug: nextSlug && nextSlug !== currentSlug ? nextSlug : undefined,
            title: normalizedTitle,
            html,
            content: plainText || JSON.stringify(contentJson),
            description: normalizedDescription,
            category,
            tags,
            cover_image: coverImage,
          }),
          signal: controller.signal,
        })

        const data = await res.json().catch(() => ({})) as { error?: string; slug?: string }
        if (!res.ok) {
          throw new Error(data.error || '自动保存失败')
        }

        if (requestId !== autosaveSeqRef.current) return

        const persistedSlug = typeof data.slug === 'string' ? data.slug : currentSlug
        if (persistedSlug !== currentSlug || latestMetaRef.current.slug !== persistedSlug) {
          syncPersistedSlug(persistedSlug, currentSlug)
        }
      } else {
        const res = await fetch('/api/posts', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            title: normalizedTitle,
            html,
            content: plainText || JSON.stringify(contentJson),
            category,
            status: 'draft',
            tags,
            description: normalizedDescription,
            cover_image: coverImage,
          }),
          signal: controller.signal,
        })

        const data = await res.json().catch(() => ({})) as { error?: string; slug?: string }
        if (!res.ok) {
          throw new Error(data.error || '自动保存失败')
        }

        if (requestId !== autosaveSeqRef.current) return

        if (typeof data.slug === 'string' && data.slug) {
          syncPersistedSlug(data.slug, null, true)
        }
      }

      if (requestId !== autosaveSeqRef.current) return

      lastAutosaveSnapshotRef.current = snapshot
      setSaveState('saved')
      setLastSavedAt(Date.now())
    } catch (error) {
      if (controller.signal.aborted) return
      if (requestId !== autosaveSeqRef.current) return

      console.error('Auto-save failed:', error)
      setSaveState('error')
      if (retryAttempt === 0) {
        toast.warning(error instanceof Error ? error.message : '自动保存失败，正在重试')
      }

      const nextAttempt = retryAttempt + 1
      const delay = Math.min(AUTOSAVE_MAX_RETRY_DELAY_MS, 2000 * (2 ** retryAttempt))
      retrySaveTimerRef.current = window.setTimeout(() => {
        if (editorRef.current) {
          void persistDraft(latestTitleRef.current, editorRef.current, nextAttempt)
        }
      }, delay)
    } finally {
      if (autosaveAbortRef.current === controller) {
        autosaveAbortRef.current = null
      }
    }
  }, [abortAutosaveRequest, buildAutosaveSnapshot, draftReady, syncPersistedSlug, toast])

  // ── Draft save ──
  const scheduleDraftSave = useCallback((
    nextTitle = latestTitleRef.current,
    editor = editorRef.current,
  ) => {
    if (typeof window === 'undefined' || !draftReady || !editor) return

    latestTitleRef.current = nextTitle
    clearAutosaveTimers()
    setSaveState((prev) => (prev === 'saving' ? prev : 'dirty'))

    draftSaveTimerRef.current = window.setTimeout(() => {
      void persistDraft(nextTitle, editor)
    }, AUTOSAVE_DEBOUNCE_MS)
  }, [clearAutosaveTimers, draftReady, persistDraft])

  const markDirty = useCallback((metaOverrides?: Partial<DraftMetaState>) => {
    if (metaOverrides && Object.keys(metaOverrides).length > 0) {
      latestMetaRef.current = {
        ...latestMetaRef.current,
        ...metaOverrides,
      }
    }
    scheduleDraftSave()
  }, [scheduleDraftSave])

  const imageExtensions = useMemo(() => createEditorExtensions({
    imageActions: {
      onSetCover: (target) => {
        setCoverImage(target.src)
        markDirty({ coverImage: target.src })
        toast.success('已设为封面')
      },
      onOpenReferenceImage: (target) => {
        setReferenceImageTarget(target)
      },
      onOpenCrop: (target) => {
        setCropImageTarget(target)
      },
    },
  }), [markDirty, toast])

  // ── File upload ──
  const uploadImageAndGetUrl = async (file: File): Promise<string> => {
    setUploadingImage(true)
    setUploadProgress(0)
    try {
      const optimizedFile = await optimizeImageForUpload(file, EDITOR_IMAGE_OPTIMIZE_OPTIONS)
      const result = await uploadEditorFile(optimizedFile, (p) => setUploadProgress(p))
      if (editorRef.current) scheduleDraftSave(latestTitleRef.current, editorRef.current)
      return result.url
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '图片上传失败')
      throw error
    } finally {
      setUploadingImage(false)
      setUploadProgress(0)
      if (fileInputRef.current) fileInputRef.current.value = ''
      if (fileUploadRef.current) fileUploadRef.current.value = ''
    }
  }

  const insertNonImageFile = async (file: File) => {
    if (file.type.startsWith('image/')) {
      try {
        const url = await uploadImageAndGetUrl(file)
        editorRef.current?.chain().focus().setImage({ src: url, alt: file.name }).run()
      } catch {}
      return
    }
    const editor = editorRef.current
    if (!editor) { toast.error('编辑器还没准备好'); return }
    setUploadingImage(true); setUploadProgress(0)
    const marker = createUploadPlaceholderMarker()
    insertUploadPlaceholder(editor, file, marker)
    try {
      const result = await uploadEditorFile(file, (p) => setUploadProgress(p))
      removeUploadPlaceholder(editor, marker)
      insertUploadedFileIntoEditor(editor, file, result)
      scheduleDraftSave(latestTitleRef.current, editor)
    } catch (error) {
      try { removeUploadPlaceholder(editor, marker) } catch {}
      toast.error(error instanceof Error ? error.message : '文件上传失败')
    } finally {
      setUploadingImage(false); setUploadProgress(0)
      if (fileInputRef.current) fileInputRef.current.value = ''
      if (fileUploadRef.current) fileUploadRef.current.value = ''
    }
  }

  const handleSelectedFiles = async (files: FileList | File[] | null | undefined) => {
    const queue = files ? Array.from(files) : []
    for (const file of queue) {
      // 顺序上传，避免多文件时占位和进度条互相打架
      await insertNonImageFile(file)
    }
  }

  // ── Cover image upload ──
  const coverInputRef = useRef<HTMLInputElement>(null)
  const handleCoverUpload = async (file: File) => {
    setUploadingImage(true); setUploadProgress(0)
    try {
      const optimizedFile = await optimizeImageForUpload(file, COVER_IMAGE_OPTIMIZE_OPTIONS)
      const result = await uploadEditorFile(optimizedFile, (p) => setUploadProgress(p))
      setCoverImage(result.url)
      markDirty({ coverImage: result.url })
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '封面上传失败')
    } finally {
      setUploadingImage(false); setUploadProgress(0)
      if (coverInputRef.current) coverInputRef.current.value = ''
    }
  }

  const handleGenerateCover = useCallback(async () => {
    const editor = editorRef.current
    if (!title.trim() && !editor?.getText({ blockSeparator: '\n\n' }).trim()) {
      toast.error('先写一点标题或正文。')
      return
    }

    setGeneratingCover(true)
    try {
      const response = await fetch('/api/editor/ai-post-metadata', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          target: 'cover',
          title: title.trim(),
          content: editor?.getText({ blockSeparator: '\n\n' }).trim() || '',
          category,
          description,
          tags,
          currentSlug: editSlug || normalizePostSlug(slug) || '',
        }),
      })

      const result = await response.json() as {
        success?: boolean
        error?: string
        image?: {
          url?: string
        }
      }

      if (!response.ok || !result.success || !result.image?.url) {
        throw new Error(result.error || '封面生成失败')
      }

      setCoverImage(result.image.url)
      markDirty({ coverImage: result.image.url })
      toast.success('封面已更新')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '封面生成失败')
    } finally {
      setGeneratingCover(false)
    }
  }, [category, description, editSlug, markDirty, slug, tags, title, toast])

  const handleRemoveCover = useCallback(() => {
    setCoverImage('')
    markDirty({ coverImage: '' })
    toast.success('封面已删除')
  }, [markDirty, toast])

  const handleGenerateTitle = useCallback(async () => {
    const editor = editorRef.current
    const documentText = editor?.getText({ blockSeparator: '\n\n' }).trim() || ''
    const context = buildDocumentContextText(title, documentText)

    if (!context.trim()) {
      toast.error('先写一点标题或正文。')
      return
    }

    setGeneratingTitle(true)
    try {
      const response = await fetch('/api/editor/ai', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'custom',
          customPrompt: TITLE_GENERATION_PROMPT,
          text: context,
        }),
      })

      const result = await readAiTextResponse(response)
      const nextTitle = extractTitleCandidate(result)
      if (!nextTitle) throw new Error('标题生成失败')

      latestTitleRef.current = nextTitle
      setTitle(nextTitle)
      markDirty()
      toast.success('标题已更新')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '标题生成失败')
    } finally {
      setGeneratingTitle(false)
    }
  }, [markDirty, title, toast])

  const showTitleTools = useCallback(() => {
    if (titleToolsHideTimerRef.current !== null) {
      window.clearTimeout(titleToolsHideTimerRef.current)
      titleToolsHideTimerRef.current = null
    }
    setTitleToolsVisible(true)
  }, [])

  const scheduleHideTitleTools = useCallback(() => {
    if (titleToolsHideTimerRef.current !== null) {
      window.clearTimeout(titleToolsHideTimerRef.current)
    }
    titleToolsHideTimerRef.current = window.setTimeout(() => {
      setTitleToolsVisible(false)
      titleToolsHideTimerRef.current = null
    }, 260)
  }, [])

  // ── Save ──
  const handleSave = async () => {
    const editor = editorRef.current
    const normalizedTitle = title.trim()
    const normalizedSlug = normalizePostSlug(slug)
    if (!normalizedTitle) { toast.error('先把文章标题写上。'); return }
    if (!editor) { toast.error('编辑器还没准备好。'); return }
    const content = editor.getText({ blockSeparator: '\n\n' }).trim()
    const html = editor.getHTML()
    const hasContent = content || /<(img|video|audio|iframe)\s/.test(html)
    if (!hasContent) { toast.error('正文还是空的。'); return }
    const normalizedDescription = (description || buildAutoDescription(content) || '').trim()

    clearAutosaveTimers()
    abortAutosaveRequest()

    setSaving(true); setSaveState('saving')

    try {
      const isEdit = editSlug !== null
      const url = isEdit ? `/api/admin/posts/${editSlug}` : '/api/posts'
      const method = isEdit ? 'PUT' : 'POST'

      let statusFields: { status: string; is_hidden: number; password?: string | null }
      if (publishStatus === 'encrypted') {
        statusFields = { status: 'published', is_hidden: 0, password: initialData?.password || generatePassword() }
      } else {
        const m = { public: { status: 'published', is_hidden: 0, password: null }, draft: { status: 'draft', is_hidden: 0, password: null }, unlisted: { status: 'published', is_hidden: 1, password: null } }
        statusFields = m[publishStatus as 'public' | 'draft' | 'unlisted']
      }

      const response = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          slug: normalizedSlug || (isEdit ? editSlug : undefined),
          title: normalizedTitle, content, html, category,
          ...statusFields,
          tags, description: normalizedDescription, cover_image: coverImage || null,
        }),
      })
      const result = (await response.json()) as {
        success?: boolean
        slug?: string
        error?: string
      }
      if (!response.ok || !result.success) throw new Error(result.error || '保存失败')

      const persistedSlug: string | null = typeof result.slug === 'string'
        ? result.slug
        : (isEdit ? editSlug : null)
      const snapshot = buildAutosaveSnapshot({
        currentSlug: persistedSlug,
        nextSlug: persistedSlug || '',
        title: normalizedTitle,
        html,
        description: (description || buildAutoDescription(content) || '').trim(),
        category,
        tags,
        coverImage,
      })
      lastAutosaveSnapshotRef.current = snapshot

      setSaveState('saved')
      setLastSavedAt(Date.now())

      if (isEdit) {
        if (!description && normalizedDescription) {
          setDescription(normalizedDescription)
        }
        if (persistedSlug) {
          syncPersistedSlug(persistedSlug, editSlug, true)
        }
        toast.success('文章已更新。')
      } else {
        if (!description && normalizedDescription) {
          setDescription(normalizedDescription)
        }
        const msgs = { public: '已发布', draft: '草稿已保存', encrypted: '已发布（加密）', unlisted: '已发布（链接访问）' }
        toast.success(msgs[publishStatus])
        setTitle('')
        latestTitleRef.current = ''
        lastAutosaveSnapshotRef.current = null
        editor.commands.clearContent()
      }
      setPublishPanelOpen(false)
    } catch (error) {
      setSaveState('error')
      toast.error(error instanceof Error ? error.message : '保存失败')
    } finally {
      setSaving(false)
    }
  }

  const handleCopyWechat = useCallback(async () => {
    const editor = editorRef.current
    const normalizedTitle = title.trim() || '无标题'

    if (!editor) {
      toast.error('编辑器还没准备好。')
      return
    }

    const content = editor.getText({ blockSeparator: '\n\n' }).trim()
    const html = editor.getHTML()
    const hasContent = content || /<(img|video|audio|iframe)\s/i.test(html)

    if (!hasContent) {
      toast.error('正文还是空的。')
      return
    }

    try {
      const { copyAsWechatArticleFormat } = await import('@/lib/wechat/copy')
      await copyAsWechatArticleFormat(normalizedTitle, html, wechatStylePreset)
      toast.success('已复制公众号格式')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '复制公众号格式失败')
    }
  }, [title, toast, wechatStylePreset])

  const handleDownloadPdf = useCallback(async () => {
    const editor = editorRef.current
    const normalizedTitle = title.trim() || '无标题'

    if (!editor) {
      toast.error('编辑器还没准备好。')
      return
    }

    const content = editor.getText({ blockSeparator: '\n\n' }).trim()
    const html = editor.getHTML()
    const hasContent = content || /<(img|video|audio|iframe)\s/i.test(html)

    if (!hasContent) {
      toast.error('正文还是空的。')
      return
    }

    try {
      const { downloadArticleAsPdf } = await import('@/lib/wechat/copy')
      await downloadArticleAsPdf(normalizedTitle, html, wechatStylePreset)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '导出 PDF 失败')
    }
  }, [title, toast, wechatStylePreset])

  const handleDownloadMarkdown = useCallback(async () => {
    const editor = editorRef.current
    const normalizedTitle = title.trim() || '无标题'

    if (!editor) {
      toast.error('编辑器还没准备好。')
      return
    }

    const content = editor.getText({ blockSeparator: '\n\n' }).trim()
    const html = editor.getHTML()
    const hasContent = content || /<(img|video|audio|iframe)\s/i.test(html)

    if (!hasContent) {
      toast.error('正文还是空的。')
      return
    }

    try {
      const { default: TurndownService } = await import('turndown')
      const { saveBlobFile } = await import('@/lib/client-download')
      const td = new TurndownService({
        headingStyle: 'atx',
        bulletListMarker: '-',
        codeBlockStyle: 'fenced',
      })
      const markdown = td.turndown(html)
      const blob = new Blob([`# ${normalizedTitle}\n\n${markdown}`], { type: 'text/markdown;charset=utf-8' })
      await saveBlobFile(blob, `${normalizedTitle}.md`, {
        types: [
          {
            description: 'Markdown',
            accept: {
              'text/markdown': ['.md'],
            },
          },
        ],
      })
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '导出 Markdown 失败')
    }
  }, [title, toast])

  const handleDownloadDocx = useCallback(async () => {
    const editor = editorRef.current
    const normalizedTitle = title.trim() || '无标题'

    if (!editor) {
      toast.error('编辑器还没准备好。')
      return
    }

    const content = editor.getText({ blockSeparator: '\n\n' }).trim()
    const html = editor.getHTML()
    const hasContent = content || /<(img|video|audio|iframe)\s/i.test(html)

    if (!hasContent) {
      toast.error('正文还是空的。')
      return
    }

    try {
      const { downloadArticleAsDocx } = await import('@/lib/wechat/copy')
      await downloadArticleAsDocx(normalizedTitle, html, wechatStylePreset)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '导出 DOCX 失败')
    }
  }, [title, toast, wechatStylePreset])

  const handleOpenWechatPublish = () => {
    const editor = editorRef.current

    if (!editor) {
      toast.error('编辑器还没准备好。')
      return
    }

    const content = editor.getText({ blockSeparator: '\n\n' }).trim()
    const html = editor.getHTML()
    const hasContent = content || /<(img|video|audio|iframe)\s/i.test(html)

    if (!hasContent) {
      toast.error('正文还是空的。')
      return
    }

    setWechatPublishOpen(true)
  }

  // ── Auto resize title ──
  const autoResizeTitle = (el: HTMLTextAreaElement) => {
    resizeTextareaHeight(el)
  }

  useAutoResizeTextarea(titleRef)

  useEffect(() => {
    resizeTextareaHeight(titleRef.current)
  }, [title, tocOpen, aiRailOpen, draftReady])

  // ── Status config ──
  const STATUS_CONFIG = [
    { key: 'public' as const, label: '公开访问', desc: '所有人可见，出现在首页和搜索', Icon: Globe },
    { key: 'draft' as const, label: '草稿自见', desc: '仅自己可见，不会发布', Icon: EyeIcon },
    { key: 'encrypted' as const, label: '加密访问', desc: '需要密码才能查看', Icon: Lock },
    { key: 'unlisted' as const, label: '链接访问', desc: '不在首页显示，但可通过链接访问', Icon: Link2 },
  ]

  // ── Save status display ──
  const saveStatusText = saveState === 'saved' ? `已保存 · ${relativeTime(lastSavedAt)}` :
    saveState === 'dirty' ? '未保存' : saveState === 'saving' ? '保存中…' : '保存失败'

  const saveStatusColor = saveState === 'saved' ? 'text-[var(--ui-success)]' :
    saveState === 'error' ? 'text-[var(--ui-warning)]' : 'text-[var(--ui-muted)]'

  const currentDocumentJson = editorRef.current?.getJSON() || initialContent
  const currentDocumentText = editorRef.current?.getText({ blockSeparator: '\n\n' }).trim() || ''
  const articleKey = editSlug
    ? `post:${editSlug}`
    : slug
      ? `draft:${slug}`
      : 'draft:new-post'
  const hasWechatPreviewContent = Boolean(
    currentDocumentText || /<(img|video|audio|iframe)\s/i.test(editorRef.current?.getHTML() || ''),
  )
  const activeWechatStyle = WECHAT_STYLE_PRESET_OPTIONS.find((option) => option.id === wechatStylePreset)
    || WECHAT_STYLE_PRESET_OPTIONS[1]
  const wechatSourceUrl = useMemo(() => {
    const currentSlug = normalizePostSlug(editSlug || slug)
    return currentSlug ? `https://${SITE_DISPLAY_URL}/${currentSlug}` : ''
  }, [editSlug, slug])
  const hasCoverImage = coverImage.trim().length > 0
  const railLayout = resolveEditorRailLayout({
    viewportWidth,
    tocPreferredOpen: tocOpen,
    aiPreferredOpen: aiRailOpen,
    aiPreferredWidth: aiRailWidth,
  })

  return (
    <div className="backoffice-shell editor-shell flex h-[100dvh] flex-col overflow-hidden bg-[var(--ui-bg)] text-[var(--ui-ink)]">
      {/* ── Sticky Header ── */}
      <header className="z-40 shrink-0 border-b border-[var(--ui-line)] bg-[color-mix(in_srgb,var(--ui-bg)_92%,transparent)] backdrop-blur-lg">
        <div className="flex min-h-14 items-center gap-3 px-4 py-2">
          <Tooltip content={railLayout.tocVisible ? '收起目录' : '展开目录'}>
            <UiIconButton
              onClick={() => setTocOpen(!tocOpen)}
              aria-label={railLayout.tocVisible ? '收起目录' : '展开目录'}
              className="h-10 w-10"
            >
              {railLayout.tocVisible ? <PanelLeftClose className="h-[1.15rem] w-[1.15rem]" /> : <PanelLeftOpen className="h-[1.15rem] w-[1.15rem]" />}
            </UiIconButton>
          </Tooltip>

          <Tooltip content={leftRailMode === 'toc' ? '切换到文章' : '切换到目录'}>
            <UiIconButton
              onClick={() => setLeftRailMode((prev) => (prev === 'toc' ? 'articles' : 'toc'))}
              aria-label={leftRailMode === 'toc' ? '切换到文章' : '切换到目录'}
              className="h-10 w-10"
            >
              {leftRailMode === 'toc' ? (
                <ScrollText className="h-[1.15rem] w-[1.15rem]" />
              ) : (
                <ListTree className="h-[1.15rem] w-[1.15rem]" />
              )}
            </UiIconButton>
          </Tooltip>

          {/* Left: Back */}
          <Link
            href="/admin/posts"
            className="flex items-center gap-1 shrink-0 text-sm text-[var(--editor-muted)] hover:text-[var(--editor-ink)] transition-colors"
          >
            <ArrowLeft className="h-[1.15rem] w-[1.15rem]" />
            <span className="hidden sm:inline">文章列表</span>
          </Link>

          <div className="mx-1 h-4 w-px bg-[var(--editor-line)]" />

          {/* Center: Save status */}
          <div className="flex min-w-0 flex-1 items-center gap-3">
            <div className={`flex items-center gap-1.5 text-sm min-w-[140px] ${saveStatusColor}`}>
              <span className={`inline-block h-2 w-2 rounded-full shrink-0 ${
                saveState === 'saved' ? 'bg-[var(--ui-success)]' :
                saveState === 'dirty' ? 'bg-[var(--ui-line-strong)]' :
                saveState === 'saving' ? 'bg-[var(--ui-muted)] animate-pulse' : 'bg-[var(--ui-warning)]'
              }`} />
              <span className="truncate">{saveStatusText}</span>
            </div>
          </div>

          {/* Upload progress (overlay) */}
          {uploadingImage && (
            <div className="flex items-center gap-2 shrink-0">
              <div className="w-20 h-1.5 bg-[var(--editor-line)] rounded-full overflow-hidden">
                <div className="h-full bg-[var(--editor-accent)] transition-all duration-300" style={{ width: `${uploadProgress}%` }} />
              </div>
              <span className="text-xs text-[var(--editor-muted)] tabular-nums">{uploadProgress}%</span>
            </div>
          )}

          {/* Right: Actions */}
          <div className="flex items-center gap-1">
            <Menu as="div" className="relative">
              <Tooltip content={`公众号样式 · ${activeWechatStyle.label}`}>
                <MenuButton
                  as={UiIconButton}
                  aria-label="公众号样式设置"
                  className="h-10 w-10"
                >
                  <Palette className="h-[1.1rem] w-[1.1rem]" />
                </MenuButton>
              </Tooltip>

              <MenuItems
                anchor="bottom end"
                transition
                className="theme-dropdown-panel z-50 mt-2 w-[22rem] overflow-hidden rounded-[1.1rem] p-1.5 outline-none transition duration-150 ease-out data-[closed]:translate-y-1 data-[closed]:opacity-0"
              >
                <div className="border-b border-[color-mix(in_srgb,var(--ui-line)_84%,transparent)] px-3 pb-2.5 pt-1.5">
                  <div className="text-sm font-medium text-[var(--ui-ink)]">公众号样式</div>
                  <div className="mt-0.5 text-xs leading-5 text-[var(--ui-muted)]">
                    选择复制、预览和发布时共用的排版风格。
                  </div>
                </div>

                <div className="max-h-[70vh] overflow-y-auto py-1">
                  {WECHAT_STYLE_PRESET_OPTIONS.map((option) => {
                    const active = option.id === wechatStylePreset
                    return (
                      <MenuItem key={option.id}>
                        <button
                          type="button"
                          onClick={() => setWechatStylePreset(option.id)}
                          className={cx(
                            'group flex w-full cursor-pointer items-start gap-3 rounded-[0.9rem] px-3 py-2.5 text-left transition',
                            active
                              ? 'bg-[color-mix(in_srgb,var(--editor-accent)_12%,var(--editor-panel))] text-[var(--editor-ink)]'
                              : 'text-[var(--editor-ink)] data-[focus]:bg-[color-mix(in_srgb,var(--editor-line)_36%,transparent)]',
                          )}
                        >
                          <span
                            className={cx(
                              'mt-[0.35rem] h-2 w-2 shrink-0 rounded-full transition-colors',
                              active
                                ? 'bg-[var(--editor-accent)]'
                                : 'bg-[color-mix(in_srgb,var(--editor-line-strong)_70%,transparent)] group-data-[focus]:bg-[color-mix(in_srgb,var(--editor-muted)_60%,transparent)]',
                            )}
                          />
                          <span className="min-w-0 flex-1">
                            <span className="block text-sm leading-5 text-[var(--ui-ink)]">
                              {option.label}
                            </span>
                            <span className="mt-0.5 block text-xs leading-5 text-[color-mix(in_srgb,var(--ui-muted)_90%,transparent)]">
                              {option.description}
                            </span>
                          </span>
                        </button>
                      </MenuItem>
                    )
                  })}
                </div>
              </MenuItems>
            </Menu>

            <Tooltip content="发布到公众号">
              <UiIconButton
                onClick={handleOpenWechatPublish}
                aria-label="发布到公众号"
                className="h-10 w-10"
              >
                <Send className="h-[1.15rem] w-[1.15rem]" />
              </UiIconButton>
            </Tooltip>

            <Menu as="div" className="relative">
              <Tooltip content="下载导出">
                <MenuButton
                  as={UiIconButton}
                  aria-label="下载导出"
                  className="h-10 w-10"
                >
                  <FileDown className="h-[1.15rem] w-[1.15rem]" />
                </MenuButton>
              </Tooltip>

              <MenuItems
                anchor="bottom end"
                transition
                className="theme-dropdown-panel z-50 mt-2 min-w-[12rem] overflow-hidden rounded-[1rem] p-1.5 outline-none transition duration-150 ease-out data-[closed]:translate-y-1 data-[closed]:opacity-0"
              >
                <MenuItem>
                  <button
                    type="button"
                    onClick={() => void handleDownloadMarkdown()}
                    className="group flex w-full cursor-pointer items-center gap-3 rounded-[0.9rem] px-3 py-2.5 text-left text-[var(--ui-ink)] transition data-[focus]:bg-[color-mix(in_srgb,var(--editor-line)_36%,transparent)]"
                  >
                    <span className="text-sm font-medium">Markdown</span>
                  </button>
                </MenuItem>
                <MenuItem>
                  <button
                    type="button"
                    onClick={() => void handleDownloadPdf()}
                    className="group flex w-full cursor-pointer items-center gap-3 rounded-[0.9rem] px-3 py-2.5 text-left text-[var(--ui-ink)] transition data-[focus]:bg-[color-mix(in_srgb,var(--editor-line)_36%,transparent)]"
                  >
                    <span className="text-sm font-medium">PDF</span>
                  </button>
                </MenuItem>
                <MenuItem>
                  <button
                    type="button"
                    onClick={() => void handleDownloadDocx()}
                    className="group flex w-full cursor-pointer items-center gap-3 rounded-[0.9rem] px-3 py-2.5 text-left text-[var(--ui-ink)] transition data-[focus]:bg-[color-mix(in_srgb,var(--editor-line)_36%,transparent)]"
                  >
                    <span className="text-sm font-medium">DOCX</span>
                  </button>
                </MenuItem>
              </MenuItems>
            </Menu>

            <AdminThemeToggle />

            <Tooltip content="系统设置">
              <UiIconButton
                onClick={handleOpenSettings}
                aria-label="系统设置"
                className="h-10 w-10"
              >
                <Settings className="h-[1.15rem] w-[1.15rem]" />
              </UiIconButton>
            </Tooltip>

            <Tooltip content={railLayout.aiVisible ? '收起 AI 对话' : '展开 AI 对话'}>
              <UiIconButton
                onClick={() => setAiRailOpen(!aiRailOpen)}
                aria-label={railLayout.aiVisible ? '收起 AI 对话' : '展开 AI 对话'}
                className="h-10 w-10"
              >
                {railLayout.aiVisible ? <PanelRightClose className="h-[1.15rem] w-[1.15rem]" /> : <PanelRightOpen className="h-[1.15rem] w-[1.15rem]" />}
              </UiIconButton>
            </Tooltip>

            <div className="mx-0.5 h-5 w-px bg-[var(--editor-line)]" />

            <Menu as="div" className="relative">
              <Tooltip content="新建文章">
                <MenuButton
                  as={UiIconButton}
                  aria-label="新建文章"
                  className="h-10 w-10"
                >
                  <Plus className="h-[1.15rem] w-[1.15rem]" />
                </MenuButton>
              </Tooltip>
              <MenuItems
                anchor="bottom end"
                className="z-50 mt-2 w-52 rounded-[1.2rem] border border-[color-mix(in_srgb,var(--ui-line)_84%,transparent)] bg-[color-mix(in_srgb,var(--ui-bg)_96%,var(--ui-panel))] p-2 shadow-[0_20px_48px_rgb(var(--ui-shadow-rgb)/0.12)] outline-none [--anchor-gap:10px]"
              >
                {createCategoryOptions.map((item) => (
                  <MenuItem key={item.slug}>
                    <button
                      type="button"
                      onClick={() => {
                        window.location.assign(`/editor?new=1&category=${encodeURIComponent(item.name)}`)
                      }}
                      className="group flex w-full items-start gap-3 rounded-[0.9rem] px-3 py-2.5 text-left text-[var(--ui-ink)] transition data-[focus]:bg-[color-mix(in_srgb,var(--editor-line)_36%,transparent)]"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="text-sm font-medium">{item.name}</div>
                        <div className="mt-0.5 text-xs text-[var(--ui-muted)]">{`创建 ${item.name} 分类文章`}</div>
                      </div>
                    </button>
                  </MenuItem>
                ))}
              </MenuItems>
            </Menu>

            {/* Publish button + dropdown */}
            <div className="relative" ref={publishPanelRef}>
              <UiButton
                type="button"
                onClick={() => setPublishPanelOpen(!publishPanelOpen)}
                disabled={saving || uploadingImage}
                tone="solid"
                className="rounded-xl px-4.5 py-2 text-sm font-semibold flex items-center gap-2 bg-[var(--editor-accent)] hover:brightness-105 active:scale-[0.98] transition text-[var(--ui-accent-ink)] shadow-sm"
              >
                <Share2 className="h-[1.05rem] w-[1.05rem]" />
                分享
              </UiButton>

              {/* Publish panel dropdown */}
              {publishPanelOpen && (
                <UiPanel className="absolute right-0 top-full z-50 mt-2 w-72 overflow-hidden rounded-[1.35rem] p-2 shadow-[0_20px_48px_rgb(var(--ui-shadow-rgb)/0.12)]">
                  {STATUS_CONFIG.map(({ key, label, desc, Icon }) => {
                    const active = publishStatus === key
                    return (
                      <button
                        key={key}
                        type="button"
                        onClick={() => setPublishStatus(key)}
                        className={cx(
                          'flex w-full items-start gap-3 rounded-[1rem] px-3 py-3 text-left transition',
                          active
                            ? 'bg-[color-mix(in_srgb,var(--editor-accent)_10%,transparent)]'
                            : 'hover:bg-[color-mix(in_srgb,var(--ui-line)_44%,transparent)]',
                        )}
                      >
                        <Icon className={`h-5 w-5 mt-0.5 shrink-0 ${active ? 'text-[var(--editor-accent)]' : 'text-[var(--editor-muted)]'}`} />
                        <div className="flex-1 min-w-0">
                          <div className={`text-sm font-medium ${active ? 'text-[var(--editor-accent)]' : 'text-[var(--editor-ink)]'}`}>{label}</div>
                          <div className="text-xs text-[var(--editor-muted)] mt-0.5">{desc}</div>
                        </div>
                        {active && <div className="w-2 h-2 rounded-full bg-[var(--editor-accent)] mt-1.5 shrink-0" />}
                      </button>
                    )
                  })}

                  {/* Share Long Image Option */}
                  <div className="border-t border-[var(--editor-line)] my-1.5 pt-1.5">
                    <button
                      type="button"
                      onClick={() => {
                        setPublishPanelOpen(false)
                        setShareLongImageOpen(true)
                      }}
                      className="flex w-full items-start gap-3 rounded-[1rem] px-3 py-3 text-left transition hover:bg-[color-mix(in_srgb,var(--ui-line)_44%,transparent)]"
                    >
                      <ImageIcon className="h-5 w-5 mt-0.5 shrink-0 text-[var(--editor-accent)]" />
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-semibold text-[var(--editor-ink)]">长图分享</div>
                        <div className="text-xs text-[var(--editor-muted)] mt-0.5">渲染为设计精美的长图卡片</div>
                      </div>
                    </button>
                  </div>

                  <div className="mt-2 border-t border-[var(--editor-line)] px-1 pt-3">
                    <UiButton
                      onClick={handleSave}
                      disabled={saving}
                      tone="solid"
                      className="w-full justify-center py-2.5 rounded-xl text-sm font-semibold"
                    >
                      {saving ? '发布中…' : '发布'}
                    </UiButton>
                  </div>
                </UiPanel>
              )}
            </div>
          </div>
        </div>

      </header>

      {/* Hidden file inputs */}
      <input ref={fileInputRef} type="file" accept="image/*" multiple className="hidden" onChange={e => { void handleSelectedFiles(e.target.files) }} />
      <input ref={fileUploadRef} type="file" accept="video/*,audio/*,.pdf,.zip,.rar,.7z,.epub,.mobi,.azw,.azw3,.txt,image/*" multiple className="hidden" onChange={e => { void handleSelectedFiles(e.target.files) }} />
      <input ref={coverInputRef} type="file" accept="image/*" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) void handleCoverUpload(f) }} />

      {/* ── Main layout: editor + sidebar ── */}
      <div className="relative flex-1 overflow-hidden">
        <EditorTocRail
          open={railLayout.tocVisible}
          editor={editorRef.current}
          documentJson={currentDocumentJson}
          scrollContainer={mainScrollRef.current}
          activeSlug={editSlug || slug || null}
          mode={leftRailMode}
        />

        {/* Main editor area */}
        <main
          ref={mainScrollRef}
          className="editor-scroll-shell relative h-full min-w-0 overflow-y-auto overflow-x-hidden transition-[padding] duration-200 ease-out"
          style={{
            paddingLeft: railLayout.leftInset,
            paddingRight: railLayout.rightInset,
          }}
        >
          <div className="mx-auto w-full max-w-[780px] px-4 pb-8 pt-10 sm:px-6">
            {/* Title input */}
            <div
              className="relative pb-4"
              onMouseEnter={showTitleTools}
              onMouseLeave={scheduleHideTitleTools}
              onFocusCapture={showTitleTools}
              onBlurCapture={(event) => {
                const nextTarget = event.relatedTarget
                if (nextTarget instanceof Node && event.currentTarget.contains(nextTarget)) return
                scheduleHideTitleTools()
              }}
            >
              {!hasCoverImage ? (
                <div
                  className={cx(
                    'absolute left-0 top-0 z-20 flex -translate-y-[calc(100%+6px)] items-center gap-5 transition-[opacity,transform] duration-200 ease-out',
                    titleToolsVisible
                      ? 'pointer-events-auto translate-y-[calc(-100%-8px)] opacity-100'
                      : 'pointer-events-none translate-y-[calc(-100%-2px)] opacity-0',
                  )}
                >
                  <button
                    type="button"
                    onClick={() => coverInputRef.current?.click()}
                    disabled={generatingCover || uploadingImage}
                    className="inline-flex h-8 cursor-pointer items-center gap-1.5 pl-0 pr-0 text-[13px] text-[var(--ui-muted)] transition hover:text-[var(--ui-ink)] disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    {uploadingImage ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
                    <span>上传封面</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleGenerateTitle()}
                    disabled={generatingTitle}
                    className="inline-flex h-8 cursor-pointer items-center gap-1.5 pl-0 pr-0 text-[13px] text-[var(--ui-muted)] transition hover:text-[var(--ui-ink)] disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    {generatingTitle ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
                    <span>生成标题</span>
                  </button>
                </div>
              ) : null}

              {hasCoverImage ? (
                <div className="mb-5 overflow-hidden rounded-[1.35rem] bg-[color-mix(in_srgb,var(--ui-line)_22%,transparent)]">
                  <div className="relative aspect-[5/2] w-full overflow-hidden bg-[color-mix(in_srgb,var(--ui-line)_18%,transparent)]">
                    <img
                      src={coverImage}
                      alt={title.trim() || '文章封面'}
                      className="h-full w-full object-cover"
                    />

                    {(generatingCover || uploadingImage) ? (
                      <div className="absolute inset-0 flex items-center justify-center bg-[color-mix(in_srgb,var(--ui-bg)_58%,transparent)]">
                        <div className="flex items-center gap-2 text-[13px] text-[var(--ui-muted)]">
                          <Loader2 className="h-4 w-4 animate-spin" />
                          <span>{generatingCover ? '生成中' : '上传中'}</span>
                        </div>
                      </div>
                    ) : null}
                  </div>

                  <div className="flex items-center gap-1 px-1.5 py-1.5">
                    <UiButton
                      tone="quiet"
                      size="sm"
                      onClick={() => void handleGenerateCover()}
                      disabled={generatingCover || uploadingImage}
                      className="rounded-lg text-[12px]"
                    >
                      <Sparkles className="h-3.5 w-3.5" />
                      更换封面
                    </UiButton>
                    <UiButton
                      tone="quiet"
                      size="sm"
                      onClick={() => coverInputRef.current?.click()}
                      disabled={generatingCover || uploadingImage}
                      className="rounded-lg text-[12px]"
                    >
                      <Upload className="h-3.5 w-3.5" />
                      上传
                    </UiButton>
                    <UiButton
                      tone="quiet"
                      size="sm"
                      onClick={() => void handleGenerateTitle()}
                      disabled={generatingTitle}
                      className="rounded-lg text-[12px]"
                    >
                      {generatingTitle ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
                      生成标题
                    </UiButton>
                    <UiButton
                      tone="quiet"
                      size="sm"
                      onClick={handleRemoveCover}
                      disabled={generatingCover || uploadingImage}
                      className="rounded-lg text-[12px]"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                      删除
                    </UiButton>
                  </div>
                </div>
              ) : null}

              <UiTextarea
                ref={titleRef}
                placeholder="无标题"
                value={title}
                rows={1}
                variant="title"
                onChange={(e) => {
                  const v = e.target.value
                  setTitle(v)
                  latestTitleRef.current = v
                  autoResizeTitle(e.target)
                  markDirty()
                }}
                onPaste={(e) => {
                  const files = extractFilesFromClipboard(e)
                  if (files.length === 0) return

                  e.preventDefault()
                  editorRef.current?.chain().focus().run()
                  void handleSelectedFiles(files)
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault()
                    editorRef.current?.chain().focus().run()
                  }
                }}
                className="editor-title-textarea block w-full overflow-hidden placeholder:text-[var(--stone-gray)]"
                style={{ minHeight: '52px' }}
              />
            </div>

            {/* Novel editor */}
            <div className="relative">
              {!draftReady ? (
                <div className="editor-surface" />
              ) : (
                <EditorRoot>
                  <div>
                    <EditorContent
                      initialContent={initialContent}
                      // eslint-disable-next-line @typescript-eslint/no-explicit-any
                      extensions={imageExtensions as any}
                      className="editor-surface"
                      immediatelyRender={false}
                      editorProps={buildEditorProps(
                        (file) => uploadImageAndGetUrl(file),
                        (file) => void insertNonImageFile(file),
                        'editor-main-prose',
                      )}
                      onCreate={({ editor }) => {
                        editorRef.current = editor
                        // eslint-disable-next-line @typescript-eslint/no-explicit-any
                        const st = editor.storage as any
                        setCharCount(st.characterCount?.characters?.() ?? 0)
                        if (initialData?.html) {
                          skipNextEditorUpdateRef.current = true
                          editor.commands.setContent(initialData.html)
                        } else {
                          skipNextEditorUpdateRef.current = false
                        }

                        if (initialData?.slug) {
                          lastAutosaveSnapshotRef.current = buildAutosaveSnapshot({
                            currentSlug: initialData.slug,
                            nextSlug: initialData.slug,
                            title: initialData.title || '无标题',
                            html: initialData.html || '',
                            description: (initialData.description || '').trim(),
                            category: initialData.category || 'AI',
                            tags: initialData.tags || [],
                            coverImage: initialData.cover_image || '',
                          })
                        } else {
                          lastAutosaveSnapshotRef.current = null
                        }
                      }}
                      onUpdate={({ editor }) => {
                        editorRef.current = editor

                        if (skipNextEditorUpdateRef.current) {
                          skipNextEditorUpdateRef.current = false
                          // eslint-disable-next-line @typescript-eslint/no-explicit-any
                          const st = editor.storage as any
                          setCharCount(st.characterCount?.characters?.() ?? 0)
                          return
                        }

                        scheduleDraftSave(latestTitleRef.current, editor)
                        // eslint-disable-next-line @typescript-eslint/no-explicit-any
                        const st = editor.storage as any
                        setCharCount(st.characterCount?.characters?.() ?? 0)
                      }}
                    >
                      <FormattingBubble />
                      <SlashMenu />
                    </EditorContent>
                  </div>
                </EditorRoot>
              )}

              {charCount > 0 ? (
                <div className="pointer-events-none absolute bottom-4 right-2 z-20 sm:bottom-5 sm:right-3">
                  <span className="text-[11px] font-medium tabular-nums text-[color-mix(in_srgb,var(--ui-muted)_68%,transparent)] sm:text-xs">
                    {charCount.toLocaleString()} 字
                  </span>
                </div>
              ) : null}
            </div>
          </div>
        </main>
        <EditorRightRail
          open={railLayout.aiVisible}
          onClose={() => setAiRailOpen(false)}
          width={railLayout.aiWidth}
          onWidthChange={setAiRailWidth}
          headerAccessory={(
            <>
              <Tooltip content="复制公众号格式">
                <UiIconButton
                  tone="quiet"
                  onClick={() => void handleCopyWechat()}
                  aria-label="复制公众号格式"
                  className="h-10 w-10 opacity-78"
                >
                  <Copy className="h-[1.05rem] w-[1.05rem]" />
                </UiIconButton>
              </Tooltip>

              <Tooltip content={rightRailMode === 'chat' ? '公众号预览' : 'AI 对话'}>
                <UiIconButton
                  tone="quiet"
                  onClick={() => {
                    if (rightRailMode === 'chat') {
                      if (!hasWechatPreviewContent) return
                      setRightRailMode('wechat-preview')
                      return
                    }

                    setRightRailMode('chat')
                  }}
                  disabled={rightRailMode === 'chat' && !hasWechatPreviewContent}
                  aria-label={rightRailMode === 'chat' ? '公众号预览' : 'AI 对话'}
                  className="h-10 w-10 opacity-78"
                >
                  {rightRailMode === 'chat'
                    ? <Smartphone className="h-[1.05rem] w-[1.05rem]" />
                    : <Bot className="h-[1.05rem] w-[1.05rem]" />}
                </UiIconButton>
              </Tooltip>
            </>
          )}
          aiContent={railLayout.aiVisible ? (
            <div className="flex h-full min-h-0 flex-col">
              <div className="relative min-h-0 flex-1 overflow-hidden">
                <div
                  className={cx(
                    'absolute inset-0 transition-all duration-180 ease-out',
                    rightRailMode === 'chat'
                      ? 'translate-x-0 opacity-100'
                      : '-translate-x-2 pointer-events-none opacity-0',
                  )}
                >
                  <AIPanel
                    articleKey={articleKey}
                    postSlug={editSlug || normalizePostSlug(slug) || null}
                    title={title}
                    editor={editorRef.current}
                    documentJson={currentDocumentJson}
                    documentText={currentDocumentText}
                    onOpenSettingsTab={(tabId) => void openSettingsModal(tabId)}
                    profilesRefreshKey={providerRefreshKey}
                    onTitleApply={(nextTitle) => {
                      latestTitleRef.current = nextTitle
                      setTitle(nextTitle)
                      markDirty()
                    }}
                    onCoverImageApply={(imageUrl) => {
                      setCoverImage(imageUrl)
                      markDirty({ coverImage: imageUrl })
                    }}
                  />
                </div>

                <div
                  className={cx(
                    'absolute inset-0 transition-all duration-180 ease-out',
                    rightRailMode === 'wechat-preview'
                      ? 'translate-x-0 opacity-100'
                      : 'translate-x-2 pointer-events-none opacity-0',
                  )}
                >
                  {hasWechatPreviewContent ? (
                    <WechatPreviewRail
                      title={title.trim() || '无标题'}
                      html={editorRef.current?.getHTML() || ''}
                      stylePreset={wechatStylePreset}
                    />
                  ) : (
                    <div className="flex h-full items-center justify-center px-5 text-center text-sm text-[var(--editor-muted)]">
                      正文还是空的。
                    </div>
                  )}
                </div>
              </div>
            </div>
          ) : null}
        />
      </div>

      {wechatPublishOpen ? (
        <WeChatPublishModal
          isOpen={wechatPublishOpen}
          onClose={() => setWechatPublishOpen(false)}
          title={title.trim() || '无标题'}
          html={editorRef.current?.getHTML() || ''}
          stylePreset={wechatStylePreset}
          defaultDigest={description}
          defaultSourceUrl={wechatSourceUrl}
          defaultCoverImageUrl={resolvePostCoverImage({
            cover_image: coverImage,
            slug: normalizePostSlug(slug) || editSlug || title,
            title,
          })}
        />
      ) : null}

      <InputModal open={inputModal.open} title={inputModal.title} placeholder={inputModal.placeholder} onConfirm={handleInputModalConfirm} onCancel={handleInputModalCancel} />

      {imageModal.open ? (
        <ImageGenerationModal
          open={imageModal.open}
          contextText={imageModal.contextText}
          sceneKey="editor_inline"
          historyScope="admin-editor"
          closeOnGenerate={false}
          onClose={closeImageModal}
          onInsert={insertGeneratedImage}
        />
      ) : null}

      {referenceImageTarget ? (
        <ImageGenerationModal
          open={Boolean(referenceImageTarget)}
          contextText=""
          sceneKey="editor_inline"
          historyScope="admin-editor"
          referenceImageUrl={referenceImageTarget.src}
          allowReplace
          defaultPlacementMode="replace"
          closeOnGenerate={false}
          generationMode="foreground"
          onClose={() => setReferenceImageTarget(null)}
          onInsert={(imageUrl, alt, placementMode) => {
            if (!referenceImageTarget) return
            applyImageActionResult(referenceImageTarget, imageUrl, alt, placementMode ?? 'replace')
            setReferenceImageTarget(null)
          }}
        />
      ) : null}

      {cropImageTarget ? (
        <ImageCropModal
          open={Boolean(cropImageTarget)}
          imageUrl={cropImageTarget.src}
          imageAlt={cropImageTarget.alt}
          defaultPlacementMode="replace"
          onClose={() => setCropImageTarget(null)}
          onApply={async (file, placementMode) => {
            if (!cropImageTarget) return

            const uploaded = await uploadImageAndGetUrl(file)
            applyImageActionResult(cropImageTarget, uploaded, cropImageTarget.alt || file.name, placementMode)
            setCropImageTarget(null)
          }}
        />
      ) : null}

      {editorRef.current && aiModal.open ? (
        <AIModal
          editor={editorRef.current}
          isOpen={aiModal.open}
          onClose={closeAiModal}
          selectedText={aiModal.selectedText}
          position={aiModal.position}
          selectionRange={aiModal.selectionRange}
          initialContext={aiModal.initialContext}
          documentTitle={aiModal.documentTitle}
          documentText={aiModal.documentText}
          historyScope="admin-editor"
          onApplyTitle={(nextTitle) => {
            latestTitleRef.current = nextTitle
            setTitle(nextTitle)
            markDirty()
          }}
        />
      ) : null}

      {shareLongImageOpen ? (
        <ShareLongImageModal
          isOpen={shareLongImageOpen}
          onClose={() => setShareLongImageOpen(false)}
          title={title.trim() || '无标题'}
          html={editorRef.current?.getHTML() || ''}
          coverImage={coverImage}
          category={category}
          siteUrl={(() => {
            const postSlug = normalizePostSlug(slug) || editSlug || ''
            const base = getSiteUrl()
            return postSlug ? `${base}/${postSlug}` : base
          })()}
        />
      ) : null}

      {settingsModalOpen ? (
        <Dialog
          open={settingsModalOpen}
          onClose={() => {
            setSettingsModalOpen(false)
            setProviderRefreshKey((prev) => prev + 1)
          }}
          className="relative z-50"
        >
          <DialogBackdrop className="fixed inset-0 bg-black/55 transition duration-200" />
          <div className="fixed inset-0 flex items-center justify-center p-4 md:p-6">
            <DialogPanel className="flex h-[85vh] w-full max-w-6xl flex-col overflow-hidden rounded-2xl border border-[color-mix(in_srgb,var(--ui-line)_84%,transparent)] bg-[var(--ui-panel)] shadow-[0_24px_64px_rgb(0_0_0/0.18)]">
              {/* Header */}
              <div className="flex items-center justify-between border-b border-[var(--editor-line)] px-6 py-4 shrink-0">
                <DialogTitle as="h3" className="text-lg font-bold text-[var(--ui-ink)]" style={{ fontFamily: 'Georgia, serif' }}>
                  系统设置
                </DialogTitle>
                <button
                  type="button"
                  onClick={() => {
                    setSettingsModalOpen(false)
                    setProviderRefreshKey((prev) => prev + 1)
                  }}
                  className="editor-quiet-icon-button h-8 w-8 shrink-0 outline-none focus:outline-none"
                  aria-label="关闭"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              {/* Body */}
              <div className="flex-1 overflow-hidden p-6 min-h-0">
                {settingsLoading ? (
                  <div className="flex h-full items-center justify-center text-sm text-[var(--editor-muted)]">
                    <Loader2 className="h-5 w-5 animate-spin mr-2" />
                    加载系统配置中...
                  </div>
                ) : settingsData ? (
                  <div className="h-full overflow-y-auto pr-1">
                    <SettingsManager
                      initialNavLinks={settingsData.navLinks}
                      initialCustomJs={settingsData.customJs}
                      initialCategories={settingsData.categories}
                      initialBodyFont={settingsData.bodyFont}
                      initialDefaultTheme={settingsData.defaultTheme}
                      initialRuntimeCapabilities={settingsData.runtimeCapabilities}
                      initialHomeShortcutEnabled={settingsData.homeShortcutEnabled}
                      initialTab={settingsActiveTab}
                      selectedTab={settingsActiveTab}
                      onTabChange={(tabId) => setSettingsActiveTab(tabId as SettingsTabId)}
                    />
                  </div>
                ) : (
                  <div className="flex h-full items-center justify-center text-sm text-[var(--ui-danger)]">
                    加载配置失败，请刷新重试
                  </div>
                )}
              </div>
            </DialogPanel>
          </div>
        </Dialog>
      ) : null}
    </div>
  )
}

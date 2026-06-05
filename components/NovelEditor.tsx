'use client'

import Link from 'next/link'
import { useEffect, useRef, useState, useCallback, useMemo } from 'react'
import {
  ArrowLeft,
  ChevronUp,
  Globe,
  Eye,
  Lock,
  Link2,
  Copy,
  FileDown,
  Send,
  PanelRightOpen,
  PanelRightClose,
  ImageIcon,
  WandSparkles,
  X,
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
import { CategorySelector } from '@/components/CategorySelector'
import { ImageGenerationModal } from '@/components/ImageGenerationModal'
import { ImageCropModal } from '@/components/ImageCropModal'
import { AIPanel } from '@/components/editor/AIPanel'
import { EditorRightRail } from '@/components/editor/EditorRightRail'
import { EditorTocRail } from '@/components/editor/EditorTocRail'
import { WeChatPublishModal } from '@/components/WeChatPublishModal'
import { useToast } from '@/components/Toast'
import { AIModal } from '@/lib/ai-modal'
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
import { copyAsWechatArticleFormat, downloadArticleAsPdf } from '@/lib/wechat-copy'
import {
  extractFilesFromClipboard,
  useEditorAuxiliaryModals,
  useEditorUploadTriggers,
} from '@/lib/editor-ui'
import type { EditorImageActionTarget } from '@/lib/resizable-image'
import { resolvePostCoverImage } from '@/lib/default-cover-images'
import { buildAutoDescription, normalizePostSlug } from '@/lib/post-utils'
import { getSiteDisplayUrl } from '@/lib/site-config'
import { resizeTextareaHeight, useAutoResizeTextarea } from '@/lib/textarea-autosize'
import { UiButton, UiIconButton, UiPanel, UiTextarea, cx } from '@/components/ui/primitives'

type SaveFeedback =
  | { type: 'success' | 'error'; message: string; slug?: string }
  | null

type PublishStatus = 'public' | 'draft' | 'encrypted' | 'unlisted'
type SaveState = 'saved' | 'dirty' | 'saving' | 'error'

const TOC_KEY = 'qmblog:toc-open'
const AI_RAIL_KEY = 'qmblog:ai-rail-open'
const AUTOSAVE_DEBOUNCE_MS = 1500
const AUTOSAVE_MAX_RETRY_DELAY_MS = 10000
const SITE_DISPLAY_URL = getSiteDisplayUrl()

const EMPTY_DOCUMENT = {
  type: 'doc',
  content: [{ type: 'paragraph' }],
} satisfies JSONContent

function calcReadTime(chars: number): string {
  const minutes = Math.max(1, Math.ceil(chars / 400))
  return `约${minutes}分钟阅读`
}

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
}

type DraftMetaState = {
  editSlug: string | null
  slug: string
  category: string
  tags: string[]
  description: string
  coverImage: string
}

export function NovelEditor({ initialData }: NovelEditorProps = {}) {
  // ── Core state ──
  const [draftReady, setDraftReady] = useState(false)
  const [initialContent, setInitialContent] = useState<JSONContent>(EMPTY_DOCUMENT)
  const editorRef = useRef<EditorInstance | null>(null)
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const fileUploadRef = useRef<HTMLInputElement | null>(null)

  // ── Fields ──
  const [editSlug, setEditSlug] = useState(initialData?.slug ?? null)
  const [title, setTitle] = useState('')
  const latestTitleRef = useRef('')
  const [charCount, setCharCount] = useState(0)
  const [category, setCategory] = useState(initialData?.category || '未分类')
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
  const [tocOpen, setTocOpen] = useState(false)
  const [aiRailOpen, setAiRailOpen] = useState(true)
  const [publishPanelOpen, setPublishPanelOpen] = useState(false)
  const [wechatPublishOpen, setWechatPublishOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [uploadingImage, setUploadingImage] = useState(false)
  const [uploadProgress, setUploadProgress] = useState(0)
  const [feedback, setFeedback] = useState<SaveFeedback>(null)
  const [saveState, setSaveState] = useState<SaveState>('saved')
  const [lastSavedAt, setLastSavedAt] = useState<number>(Date.now())
  const [referenceImageTarget, setReferenceImageTarget] = useState<EditorImageActionTarget | null>(null)
  const [cropImageTarget, setCropImageTarget] = useState<EditorImageActionTarget | null>(null)
  const [, setTick] = useState(0) // force re-render for relative time
  const publishPanelRef = useRef<HTMLDivElement>(null)
  const titleRef = useRef<HTMLTextAreaElement>(null)
  const toast = useToast()

  // Draft save refs
  const draftSaveTimerRef = useRef<number | null>(null)
  const retrySaveTimerRef = useRef<number | null>(null)
  const autosaveAbortRef = useRef<AbortController | null>(null)
  const autosaveSeqRef = useRef(0)
  const lastAutosaveSnapshotRef = useRef<string | null>(null)
  const skipNextEditorUpdateRef = useRef(Boolean(initialData?.html))
  const slugInputFocusedRef = useRef(false)
  const latestMetaRef = useRef<DraftMetaState>({
    editSlug: initialData?.slug ?? null,
    slug: initialData?.slug || '',
    category: initialData?.category || '未分类',
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
      setTocOpen(window.localStorage.getItem(TOC_KEY) === 'true')
      const storedAiRail = window.localStorage.getItem(AI_RAIL_KEY)
      setAiRailOpen(storedAiRail === null ? true : storedAiRail === 'true')
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Persist rail preferences
  useEffect(() => {
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(TOC_KEY, String(tocOpen))
      window.localStorage.setItem(AI_RAIL_KEY, String(aiRailOpen))
    }
  }, [aiRailOpen, tocOpen])

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
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  })

  const {
    aiModal,
    closeAiModal,
    closeImageModal,
    handleInputModalCancel,
    handleInputModalConfirm,
    imageModal,
    inputModal,
    openDocumentAIModal,
    openDocumentImageModal,
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
  }, [abortAutosaveRequest, buildAutosaveSnapshot, draftReady, syncPersistedSlug])

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
        setFeedback({ type: 'success', message: '已设为封面' })
      },
      onOpenReferenceImage: (target) => {
        setReferenceImageTarget(target)
      },
      onOpenCrop: (target) => {
        setCropImageTarget(target)
      },
    },
  }), [markDirty])

  // ── File upload ──
  const uploadImageAndGetUrl = async (file: File): Promise<string> => {
    setUploadingImage(true)
    setUploadProgress(0)
    setFeedback(null)
    try {
      const optimizedFile = await optimizeImageForUpload(file, EDITOR_IMAGE_OPTIMIZE_OPTIONS)
      const result = await uploadEditorFile(optimizedFile, (p) => setUploadProgress(p))
      if (editorRef.current) scheduleDraftSave(latestTitleRef.current, editorRef.current)
      return result.url
    } catch (error) {
      setFeedback({ type: 'error', message: error instanceof Error ? error.message : '图片上传失败' })
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
    if (!editor) { setFeedback({ type: 'error', message: '编辑器还没准备好' }); return }
    setUploadingImage(true); setUploadProgress(0); setFeedback(null)
    const marker = createUploadPlaceholderMarker()
    insertUploadPlaceholder(editor, file, marker)
    try {
      const result = await uploadEditorFile(file, (p) => setUploadProgress(p))
      removeUploadPlaceholder(editor, marker)
      insertUploadedFileIntoEditor(editor, file, result)
      scheduleDraftSave(latestTitleRef.current, editor)
    } catch (error) {
      try { removeUploadPlaceholder(editor, marker) } catch {}
      setFeedback({ type: 'error', message: error instanceof Error ? error.message : '文件上传失败' })
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
      setFeedback({ type: 'error', message: error instanceof Error ? error.message : '封面上传失败' })
    } finally {
      setUploadingImage(false); setUploadProgress(0)
      if (coverInputRef.current) coverInputRef.current.value = ''
    }
  }

  // ── Save ──
  const handleSave = async () => {
    const editor = editorRef.current
    const normalizedTitle = title.trim()
    const normalizedSlug = normalizePostSlug(slug)
    if (!normalizedTitle) { setFeedback({ type: 'error', message: '先把文章标题写上。' }); return }
    if (!editor) { setFeedback({ type: 'error', message: '编辑器还没准备好。' }); return }
    const content = editor.getText({ blockSeparator: '\n\n' }).trim()
    const html = editor.getHTML()
    const hasContent = content || /<(img|video|audio|iframe)\s/.test(html)
    if (!hasContent) { setFeedback({ type: 'error', message: '正文还是空的。' }); return }
    const normalizedDescription = (description || buildAutoDescription(content) || '').trim()

    clearAutosaveTimers()
    abortAutosaveRequest()

    setSaving(true); setSaveState('saving'); setFeedback(null)

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
        setFeedback({ type: 'success', message: '文章已更新。', slug: persistedSlug || editSlug || undefined })
      } else {
        if (!description && normalizedDescription) {
          setDescription(normalizedDescription)
        }
        const msgs = { public: '已发布', draft: '草稿已保存', encrypted: '已发布（加密）', unlisted: '已发布（链接访问）' }
        setFeedback({ type: 'success', message: `${msgs[publishStatus]}`, slug: result.slug })
        setTitle('')
        latestTitleRef.current = ''
        lastAutosaveSnapshotRef.current = null
        editor.commands.clearContent()
      }
      setPublishPanelOpen(false)
    } catch (error) {
      setSaveState('error')
      setFeedback({ type: 'error', message: error instanceof Error ? error.message : '保存失败' })
    } finally {
      setSaving(false)
    }
  }

  const handleCopyWechat = async () => {
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
      await copyAsWechatArticleFormat(normalizedTitle, html)
      toast.success('已复制公众号格式')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '复制公众号格式失败')
    }
  }

  const handleDownloadPdf = async () => {
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
      await downloadArticleAsPdf(normalizedTitle, html)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '导出 PDF 失败')
    }
  }

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
    { key: 'draft' as const, label: '草稿自见', desc: '仅自己可见，不会发布', Icon: Eye },
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
  const wechatSourceUrl = useMemo(() => {
    const currentSlug = normalizePostSlug(editSlug || slug)
    return currentSlug ? `https://${SITE_DISPLAY_URL}/${currentSlug}` : ''
  }, [editSlug, slug])

  return (
    <div className="backoffice-shell editor-shell min-h-screen bg-[var(--ui-bg)] text-[var(--ui-ink)]">
      {/* ── Sticky Header ── */}
      <header className="sticky top-0 z-40 border-b border-[var(--ui-line)] bg-[color-mix(in_srgb,var(--ui-bg)_92%,transparent)] backdrop-blur-lg">
        <div className="flex min-h-14 items-center gap-3 px-4 py-2">
          {/* Left: Back */}
          <Link
            href="/admin/posts"
            className="flex items-center gap-1 shrink-0 text-sm text-[var(--editor-muted)] hover:text-[var(--editor-ink)] transition-colors"
          >
            <ArrowLeft className="h-[1.15rem] w-[1.15rem]" />
            <span className="hidden sm:inline">文章列表</span>
          </Link>

          <div className="mx-1 h-4 w-px bg-[var(--editor-line)]" />

          {/* Center: Save status + Word count */}
          <div className="flex min-w-0 flex-1 items-center gap-3">
            <div className={`flex items-center gap-1.5 text-sm min-w-[140px] ${saveStatusColor}`}>
              <span className={`inline-block h-2 w-2 rounded-full shrink-0 ${
                saveState === 'saved' ? 'bg-[var(--ui-success)]' :
                saveState === 'dirty' ? 'bg-[var(--ui-line-strong)]' :
                saveState === 'saving' ? 'bg-[var(--ui-muted)] animate-pulse' : 'bg-[var(--ui-warning)]'
              }`} />
              <span className="truncate">{saveStatusText}</span>
            </div>

            {charCount > 0 && (
              <>
                <div className="hidden sm:block h-4 w-px bg-[var(--editor-line)]" />
                <div className="hidden sm:flex items-center gap-2">
                  <span className="text-sm text-[var(--stone-gray)] whitespace-nowrap tabular-nums">
                    {charCount.toLocaleString()} 字 · {calcReadTime(charCount)}
                  </span>
                </div>
              </>
            )}
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
            <UiIconButton
              onClick={handleCopyWechat}
              title="复制公众号格式"
              aria-label="复制公众号格式"
              className="h-10 w-10"
            >
              <Copy className="h-[1.15rem] w-[1.15rem]" />
            </UiIconButton>

            <UiIconButton
              onClick={handleOpenWechatPublish}
              title="发布到公众号"
              aria-label="发布到公众号"
              className="h-10 w-10"
            >
              <Send className="h-[1.15rem] w-[1.15rem]" />
            </UiIconButton>

            <UiIconButton
              onClick={handleDownloadPdf}
              title="下载 PDF"
              aria-label="下载 PDF"
              className="h-10 w-10"
            >
              <FileDown className="h-[1.15rem] w-[1.15rem]" />
            </UiIconButton>

            <UiIconButton
              onClick={(e) => openDocumentAIModal(e.currentTarget)}
              title="Ask AI（基于标题和正文）"
              aria-label="Ask AI（基于标题和正文）"
              className="h-10 w-10"
            >
              <WandSparkles className="h-[1.15rem] w-[1.15rem]" />
            </UiIconButton>

            <UiIconButton
              onClick={openDocumentImageModal}
              title="生成图片"
              aria-label="生成图片"
              className="h-10 w-10"
            >
              <ImageIcon className="h-[1.15rem] w-[1.15rem]" />
            </UiIconButton>

            <UiIconButton
              onClick={() => setAiRailOpen(!aiRailOpen)}
              title={aiRailOpen ? '收起 AI 对话' : '展开 AI 对话'}
              aria-label={aiRailOpen ? '收起 AI 对话' : '展开 AI 对话'}
              className="h-10 w-10"
            >
              {aiRailOpen ? <PanelRightClose className="h-[1.15rem] w-[1.15rem]" /> : <PanelRightOpen className="h-[1.15rem] w-[1.15rem]" />}
            </UiIconButton>

            <div className="mx-0.5 h-5 w-px bg-[var(--editor-line)]" />

            {/* Category selector */}
            <CategorySelector value={category} onChange={(val) => { setCategory(val); markDirty({ category: val }) }} />

            {/* Publish button + dropdown */}
            <div className="relative" ref={publishPanelRef}>
              <div className="inline-flex items-center gap-px rounded-[1rem] bg-[var(--editor-accent)] p-0.5">
                <UiButton
                  type="button"
                  onClick={handleSave}
                  disabled={saving || uploadingImage}
                  tone="solid"
                  className="rounded-[0.9rem] bg-transparent px-3.5 text-[var(--ui-accent-ink)] hover:bg-white/8"
                >
                  <Globe className="h-[1.05rem] w-[1.05rem]" />
                  {saving ? '保存中…' : editSlug ? '更新' : '发布'}
                </UiButton>
                <UiIconButton
                  type="button"
                  onClick={() => setPublishPanelOpen(!publishPanelOpen)}
                  tone="solid"
                  className="h-10 w-10 rounded-[0.9rem] bg-transparent text-[var(--ui-accent-ink)] hover:bg-white/8"
                  aria-label="切换发布菜单"
                >
                  <ChevronUp className={`h-[1.05rem] w-[1.05rem] transition-transform ${publishPanelOpen ? 'rotate-180' : ''}`} />
                </UiIconButton>
              </div>

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

                  <div className="mt-2 flex justify-end gap-2 border-t border-[var(--editor-line)] px-1 pt-3">
                    <UiButton
                      onClick={() => { setPublishStatus('draft'); handleSave() }}
                      disabled={saving}
                      tone="soft"
                    >
                      保存草稿
                    </UiButton>
                    <UiButton
                      onClick={handleSave}
                      disabled={saving}
                      tone="solid"
                    >
                      {saving ? '保存中…' : editSlug ? '更新文章' : '发布'}
                    </UiButton>
                  </div>
                </UiPanel>
              )}
            </div>
          </div>
        </div>

        {/* Feedback bar */}
        {feedback && (
          <div className="border-t border-[var(--ui-line)] px-4 py-2">
            <div className={`flex items-center gap-2 rounded-[1rem] px-3 py-2 text-sm ${
              feedback.type === 'success'
                ? 'bg-[color-mix(in_srgb,var(--ui-success)_14%,transparent)] text-[var(--ui-success)]'
                : 'bg-[color-mix(in_srgb,var(--ui-danger)_14%,transparent)] text-[var(--ui-danger)]'
            }`}>
              <span>{feedback.message}</span>
              {feedback.slug && (
                <a href={`/${feedback.slug}`} className="font-medium underline underline-offset-2">打开文章</a>
              )}
              <UiIconButton type="button" onClick={() => setFeedback(null)} className="ml-auto h-7 w-7" aria-label="关闭提示">
                <X className="h-3.5 w-3.5" />
              </UiIconButton>
            </div>
          </div>
        )}
      </header>

      {/* Hidden file inputs */}
      <input ref={fileInputRef} type="file" accept="image/*" multiple className="hidden" onChange={e => { void handleSelectedFiles(e.target.files) }} />
      <input ref={fileUploadRef} type="file" accept="video/*,audio/*,.pdf,.zip,.rar,.7z,.epub,.mobi,.azw,.azw3,.txt,image/*" multiple className="hidden" onChange={e => { void handleSelectedFiles(e.target.files) }} />
      <input ref={coverInputRef} type="file" accept="image/*" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) void handleCoverUpload(f) }} />

      {/* ── Main layout: editor + sidebar ── */}
      <div className="flex">
        <EditorTocRail
          open={tocOpen}
          editor={editorRef.current}
          documentJson={currentDocumentJson}
          onToggle={() => setTocOpen((current) => !current)}
        />

        {/* Main editor area */}
        <main className="flex-1 min-w-0">
          <div className="mx-auto max-w-4xl px-4 pb-8 pt-10 sm:px-6">
            {/* Title input */}
            <div className="pb-4">
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
                  if (feedback?.type === 'error') setFeedback(null)
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
                          category: initialData.category || '未分类',
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
          </div>
        </main>
        <EditorRightRail
          open={aiRailOpen}
          onClose={() => setAiRailOpen(false)}
          aiContent={(
            <AIPanel
              articleKey={articleKey}
              postSlug={editSlug || normalizePostSlug(slug) || null}
              title={title}
              editor={editorRef.current}
              documentJson={currentDocumentJson}
              documentText={currentDocumentText}
            />
          )}
        />
      </div>

      <WeChatPublishModal
        isOpen={wechatPublishOpen}
        onClose={() => setWechatPublishOpen(false)}
        title={title.trim() || '无标题'}
        html={editorRef.current?.getHTML() || ''}
        defaultDigest={description}
        defaultSourceUrl={wechatSourceUrl}
        defaultCoverImageUrl={resolvePostCoverImage({
          cover_image: coverImage,
          slug: normalizePostSlug(slug) || editSlug || title,
          title,
        })}
      />

      <InputModal open={inputModal.open} title={inputModal.title} placeholder={inputModal.placeholder} onConfirm={handleInputModalConfirm} onCancel={handleInputModalCancel} />

      <ImageGenerationModal
        open={imageModal.open}
        contextText={imageModal.contextText}
        historyScope="admin-editor"
        closeOnGenerate={false}
        onClose={closeImageModal}
        onInsert={insertGeneratedImage}
      />

      <ImageGenerationModal
        open={Boolean(referenceImageTarget)}
        contextText=""
        historyScope="admin-editor"
        referenceImageUrl={referenceImageTarget?.src}
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

      <ImageCropModal
        open={Boolean(cropImageTarget)}
        imageUrl={cropImageTarget?.src || ''}
        imageAlt={cropImageTarget?.alt}
        defaultPlacementMode="replace"
        onClose={() => setCropImageTarget(null)}
        onApply={async (file, placementMode) => {
          if (!cropImageTarget) return

          const uploaded = await uploadImageAndGetUrl(file)
          applyImageActionResult(cropImageTarget, uploaded, cropImageTarget.alt || file.name, placementMode)
          setCropImageTarget(null)
        }}
      />

      {editorRef.current && (
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
      )}
    </div>
  )
}

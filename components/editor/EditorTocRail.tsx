'use client'

import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import type { EditorInstance, JSONContent } from 'novel'
import { ChevronDown } from 'lucide-react'
import { buildEditorToc, flattenEditorToc, type EditorTocItem } from '@/lib/editor-toc'
import { cx } from '@/components/ui/primitives'

interface EditorTocRailProps {
  open: boolean
  editor: EditorInstance | null
  documentJson: JSONContent | null
  scrollContainer: HTMLElement | null
  activeSlug?: string | null
  mode: LeftRailMode
}

const TOC_EXPANDED_KEY = 'qmblog:toc-expanded'

type LeftRailMode = 'toc' | 'articles'

type ArticleListItem = {
  slug: string
  title: string
}

function findHeadingPosition(editor: EditorInstance, blockIndex: number) {
  let currentTopLevelIndex = -1
  let pos: number | null = null

  editor.state.doc.descendants((node, nodePos) => {
    if (!node.isBlock) return true
    currentTopLevelIndex += 1
    if (currentTopLevelIndex !== blockIndex) return true
    pos = nodePos
    return false
  })

  return pos
}

function collectRootExpandedIds(items: EditorTocItem[], acc = new Set<string>()) {
  for (const item of items) {
    if (item.children.length > 0) {
      acc.add(item.id)
    }
  }
  return acc
}

function findAncestorIds(items: EditorTocItem[], targetIndex: number, parents: string[] = []): string[] | null {
  for (const item of items) {
    if (item.index === targetIndex) {
      return parents
    }

    const nested = findAncestorIds(item.children, targetIndex, [...parents, item.id])
    if (nested) return nested
  }

  return null
}

function getIndentClass(level: number) {
  if (level <= 1) return ''
  if (level === 2) return 'ml-4 pl-1'
  if (level === 3) return 'ml-7 pl-1'
  return 'ml-10 pl-1'
}

function TocNode({
  item,
  activeIndex,
  expandedIds,
  onToggle,
  onJump,
}: {
  item: EditorTocItem
  activeIndex: number | null
  expandedIds: Set<string>
  onToggle: (id: string) => void
  onJump: (item: EditorTocItem) => void
}) {
  const isActive = activeIndex === item.index
  const hasChildren = item.children.length > 0
  const isExpanded = hasChildren ? expandedIds.has(item.id) : false
  const textClassName = item.level === 1
    ? 'text-[13px] font-semibold tracking-[0.01em]'
    : item.level === 2
      ? 'text-[13px] font-medium'
      : item.level === 3
        ? 'text-[12.5px] font-normal text-[var(--editor-toc-level-3)]'
        : 'text-[12.5px] font-normal text-[var(--editor-toc-level-4)]'

  return (
    <div className="space-y-0.5">
      <div
        className={cx(
          'group relative flex min-h-8 items-start gap-1.5 rounded-[0.85rem] pr-2 transition-colors',
          'hover:bg-[color-mix(in_srgb,var(--ui-line)_22%,transparent)]',
        )}
        data-active={isActive ? 'true' : 'false'}
      >
        <div className="flex h-8 w-5 shrink-0 items-center justify-center">
          {hasChildren ? (
            <button
              type="button"
              onClick={() => onToggle(item.id)}
              className="editor-toc-toggle flex h-4 w-4 cursor-pointer items-center justify-center rounded-sm"
              aria-label={isExpanded ? '折叠小节' : '展开小节'}
              title={isExpanded ? '折叠小节' : '展开小节'}
            >
              <ChevronDown className={`h-3.5 w-3.5 transition-transform ${isExpanded ? 'rotate-0' : '-rotate-90'}`} />
            </button>
          ) : (
            <span className="block h-4 w-4" />
          )}
        </div>

        <button
          type="button"
          onClick={() => onJump(item)}
          className="min-w-0 flex-1 cursor-pointer py-1.5 text-left"
        >
          <div
            className={cx(
              'editor-toc-text truncate leading-6.5',
              textClassName,
              isActive
                ? 'font-semibold text-[var(--ui-ink)]'
                : 'text-[color-mix(in_srgb,var(--ui-ink)_86%,var(--ui-muted))]',
            )}
            data-level={String(item.level)}
          >
            {item.text}
          </div>
        </button>
      </div>

      {hasChildren && isExpanded ? (
        <div className={getIndentClass(item.level + 1)}>
          {item.children.map((child) => (
            <TocNode
              key={child.id}
              item={child}
              activeIndex={activeIndex}
              expandedIds={expandedIds}
              onToggle={onToggle}
              onJump={onJump}
            />
          ))}
        </div>
      ) : null}
    </div>
  )
}

export function EditorTocRail({
  open,
  editor,
  documentJson,
  scrollContainer,
  activeSlug = null,
  mode,
}: EditorTocRailProps) {
  const tocTree = useMemo(() => buildEditorToc(documentJson), [documentJson])
  const tocItems = useMemo(() => flattenEditorToc(tocTree), [tocTree])
  const [activeIndex, setActiveIndex] = useState<number | null>(null)
  const [articles, setArticles] = useState<ArticleListItem[]>([])
  const [manualExpandedIds, setManualExpandedIds] = useState<string[] | null>(() => {
    if (typeof window === 'undefined') return null

    const raw = window.localStorage.getItem(TOC_EXPANDED_KEY)
    if (!raw) return null

    try {
      const parsed = JSON.parse(raw) as string[]
      return Array.isArray(parsed) ? parsed : null
    } catch {
      return null
    }
  })
  const defaultExpandedIds = useMemo(() => collectRootExpandedIds(tocTree), [tocTree])
  const activeAncestorIds = useMemo(
    () => (activeIndex === null ? [] : (findAncestorIds(tocTree, activeIndex) ?? [])),
    [activeIndex, tocTree],
  )
  const expandedIds = useMemo(() => {
    const base = manualExpandedIds === null
      ? new Set(defaultExpandedIds)
      : new Set(manualExpandedIds.filter((id) => defaultExpandedIds.has(id)))

    if (manualExpandedIds !== null && base.size === 0 && defaultExpandedIds.size > 0) {
      defaultExpandedIds.forEach((id) => base.add(id))
    }

    activeAncestorIds.forEach((id) => base.add(id))
    return base
  }, [activeAncestorIds, defaultExpandedIds, manualExpandedIds])

  useEffect(() => {
    if (typeof window === 'undefined') return
    window.localStorage.setItem(
      TOC_EXPANDED_KEY,
      JSON.stringify(manualExpandedIds ?? Array.from(defaultExpandedIds)),
    )
  }, [defaultExpandedIds, manualExpandedIds])

  useEffect(() => {
    if (!open || mode !== 'articles') return

    let cancelled = false

    void fetch('/api/admin/posts', { credentials: 'include' })
      .then(async (response) => {
        if (!response.ok) {
          throw new Error('文章列表加载失败')
        }
        return response.json() as Promise<{ posts?: ArticleListItem[] }>
      })
      .then((data) => {
        if (cancelled) return
        setArticles(Array.isArray(data.posts) ? data.posts : [])
      })
      .catch(() => {
        if (cancelled) return
        setArticles([])
      })

    return () => {
      cancelled = true
    }
  }, [mode, open])

  useEffect(() => {
    if (!editor || !open) return

    const updateActiveIndex = () => {
      const headingPositions = tocItems.reduce<Array<{ index: number; pos: number }>>((acc, item) => {
        const pos = findHeadingPosition(editor, item.index)
        if (Number.isFinite(pos)) {
          acc.push({ index: item.index, pos: Number(pos) })
        }
        return acc
      }, [])

      if (headingPositions.length === 0) {
        setActiveIndex(null)
        return
      }

      let nextActiveIndex = headingPositions[0]?.index ?? null
      for (const heading of headingPositions) {
        const domNode = editor.view.nodeDOM(heading.pos)
        if (!(domNode instanceof HTMLElement)) continue
        const rect = domNode.getBoundingClientRect()
        if (rect.top <= 160) {
          nextActiveIndex = heading.index
        } else {
          break
        }
      }

      setActiveIndex(nextActiveIndex)
    }

    updateActiveIndex()
    editor.on('selectionUpdate', updateActiveIndex)
    editor.on('update', updateActiveIndex)
    const currentScrollContainer = scrollContainer
    currentScrollContainer?.addEventListener('scroll', updateActiveIndex, { passive: true })
    window.addEventListener('resize', updateActiveIndex)

    return () => {
      editor.off('selectionUpdate', updateActiveIndex)
      editor.off('update', updateActiveIndex)
      currentScrollContainer?.removeEventListener('scroll', updateActiveIndex)
      window.removeEventListener('resize', updateActiveIndex)
    }
  }, [editor, open, scrollContainer, tocItems])

  const handleToggle = (id: string) => {
    setManualExpandedIds((current) => {
      const next = current === null
        ? new Set(defaultExpandedIds)
        : new Set(current.filter((item) => defaultExpandedIds.has(item)))

      if (next.has(id)) {
        next.delete(id)
      } else {
        next.add(id)
      }

      return Array.from(next)
    })
  }

  const handleJump = (item: EditorTocItem) => {
    if (!editor) return
    const pos = findHeadingPosition(editor, item.index)
    if (!Number.isFinite(pos)) return
    editor.chain().focus().setTextSelection(Number(pos) + 1).run()
    const domNode = editor.view.nodeDOM(Number(pos))
    if (domNode instanceof HTMLElement) {
      domNode.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }
  }

  return (
    <aside
      className={`absolute left-0 top-0 z-30 overflow-hidden transition-[width,opacity] duration-200 ease-out ${open ? 'opacity-100' : 'pointer-events-none opacity-0'}`}
      style={{
        width: open ? 272 : 0,
        height: '100%',
      }}
    >
      {open ? (
        <div className="flex h-full min-h-0 flex-col bg-transparent px-4 py-4">
          <div className="editor-scroll-shell min-h-0 flex-1 overflow-y-auto pr-2">
            {mode === 'toc' ? (
              tocTree.length === 0 ? null : (
              <div className="space-y-0.5">
                {tocTree.map((item) => (
                  <TocNode
                    key={item.id}
                    item={item}
                    activeIndex={activeIndex}
                    expandedIds={expandedIds}
                    onToggle={handleToggle}
                    onJump={handleJump}
                  />
                ))}
              </div>
              )
            ) : (
              <div className="space-y-0.5">
                {articles.map((article) => {
                  const active = article.slug === activeSlug
                  return (
                    <Link
                      key={article.slug}
                      href={`/editor?edit=${encodeURIComponent(article.slug)}`}
                      className={cx(
                        'block rounded-[0.85rem] px-3 py-2 text-[13px] leading-6 transition',
                        active
                          ? 'bg-[color-mix(in_srgb,var(--ui-line)_30%,transparent)] font-semibold text-[var(--ui-ink)]'
                          : 'text-[color-mix(in_srgb,var(--ui-ink)_86%,var(--ui-muted))] hover:bg-[color-mix(in_srgb,var(--ui-line)_22%,transparent)]',
                      )}
                      title={article.title}
                    >
                      <span className="block truncate">{article.title}</span>
                    </Link>
                  )
                })}
              </div>
            )}
          </div>
        </div>
      ) : null}
    </aside>
  )
}

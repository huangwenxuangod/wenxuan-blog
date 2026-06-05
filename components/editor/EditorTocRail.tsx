'use client'

import { useEffect, useMemo, useState } from 'react'
import type { EditorInstance, JSONContent } from 'novel'
import { ChevronDown } from 'lucide-react'
import { buildEditorToc, flattenEditorToc, type EditorTocItem } from '@/lib/editor-toc'

interface EditorTocRailProps {
  open: boolean
  editor: EditorInstance | null
  documentJson: JSONContent | null
}

const TOC_EXPANDED_KEY = 'qmblog:toc-expanded'

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

  return (
    <div className="space-y-px">
      <div
        className="editor-toc-row group"
        data-active={isActive ? 'true' : 'false'}
      >
        <div className="flex h-7 w-4 shrink-0 items-center justify-center">
          {hasChildren ? (
            <button
              type="button"
              onClick={() => onToggle(item.id)}
              className="editor-toc-toggle flex h-4 w-4 cursor-pointer items-center justify-center rounded-sm"
              aria-label={isExpanded ? '折叠小节' : '展开小节'}
              title={isExpanded ? '折叠小节' : '展开小节'}
            >
              <ChevronDown className={`h-3 w-3 transition-transform ${isExpanded ? 'rotate-0' : '-rotate-90'}`} />
            </button>
          ) : (
            <span className="editor-toc-leaf h-1 w-1 rounded-full" />
          )}
        </div>

        <button
          type="button"
          onClick={() => onJump(item)}
          className="min-w-0 flex-1 cursor-pointer py-1 text-left"
        >
          <div
            className={`editor-toc-text truncate ${
              item.level === 1
                ? 'text-[15px] font-semibold leading-7'
                : item.level === 2
                  ? 'text-[14px] font-medium leading-6.5'
                  : item.level === 3
                    ? 'text-[13px] font-normal leading-6'
                    : 'text-[13px] font-normal leading-6'
            }`}
            data-level={String(item.level)}
          >
            {item.text}
          </div>
        </button>
      </div>

      {hasChildren && isExpanded ? (
        <div className="ml-3.5 pl-1.5">
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
}: EditorTocRailProps) {
  const tocTree = useMemo(() => buildEditorToc(documentJson), [documentJson])
  const tocItems = useMemo(() => flattenEditorToc(tocTree), [tocTree])
  const [activeIndex, setActiveIndex] = useState<number | null>(null)
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
    window.addEventListener('scroll', updateActiveIndex, { passive: true })
    window.addEventListener('resize', updateActiveIndex)

    return () => {
      editor.off('selectionUpdate', updateActiveIndex)
      editor.off('update', updateActiveIndex)
      window.removeEventListener('scroll', updateActiveIndex)
      window.removeEventListener('resize', updateActiveIndex)
    }
  }, [editor, open, tocItems])

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
      className={`relative shrink-0 transition-[width,opacity,padding] duration-200 ease-in-out ${open ? 'opacity-100' : 'overflow-hidden opacity-0'}`}
      style={{
        width: open ? 248 : 0,
        position: 'sticky',
        top: '3.5rem',
        height: 'calc(100vh - 3.5rem)',
      }}
    >
      {open ? (
        <div className="flex h-full min-h-0 flex-col pr-2 pt-4">
          <div className="min-h-0 flex-1 overflow-y-auto px-1 pb-6">
            {tocTree.length === 0 ? (
              <div className="px-2 py-2 text-sm leading-7 text-[var(--editor-muted)]">还没有可导航的标题</div>
            ) : (
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
            )}
          </div>
        </div>
      ) : null}
    </aside>
  )
}

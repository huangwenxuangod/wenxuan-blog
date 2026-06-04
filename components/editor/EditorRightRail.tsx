'use client'

import { useEffect, useRef } from 'react'
import type { ReactNode } from 'react'
import { MessageSquare, PanelRightClose, Settings2 } from 'lucide-react'

type RailTab = 'settings' | 'ai'

interface EditorRightRailProps {
  open: boolean
  width: number
  activeTab: RailTab
  onActiveTabChange: (tab: RailTab) => void
  onClose: () => void
  onWidthChange: (nextWidth: number) => void
  settingsContent: ReactNode
  aiContent: ReactNode
}

const MIN_RAIL_WIDTH = 320
const MAX_RAIL_WIDTH = 560

export function EditorRightRail({
  open,
  width,
  activeTab,
  onActiveTabChange,
  onClose,
  onWidthChange,
  settingsContent,
  aiContent,
}: EditorRightRailProps) {
  const dragStateRef = useRef<{
    startX: number
    startWidth: number
  } | null>(null)

  useEffect(() => {
    if (!open) return

    const handleMouseMove = (event: MouseEvent) => {
      if (!dragStateRef.current) return
      const delta = dragStateRef.current.startX - event.clientX
      const nextWidth = Math.max(
        MIN_RAIL_WIDTH,
        Math.min(MAX_RAIL_WIDTH, dragStateRef.current.startWidth + delta),
      )
      onWidthChange(nextWidth)
    }

    const handleMouseUp = () => {
      dragStateRef.current = null
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
    }

    window.addEventListener('mousemove', handleMouseMove)
    window.addEventListener('mouseup', handleMouseUp)
    return () => {
      window.removeEventListener('mousemove', handleMouseMove)
      window.removeEventListener('mouseup', handleMouseUp)
    }
  }, [onWidthChange, open])

  return (
    <aside
      className={`relative shrink-0 border-l border-[var(--editor-line)] bg-[var(--background)] transition-[width] duration-200 ease-in-out ${
        open ? '' : 'overflow-hidden border-l-0'
      }`}
      style={{
        width: open ? width : 0,
        position: 'sticky',
        top: '3.5rem',
        height: 'calc(100vh - 3.5rem)',
      }}
    >
      {open ? (
        <>
          <div
            role="separator"
            aria-orientation="vertical"
            className="absolute left-0 top-0 z-10 h-full w-3 -translate-x-1/2 cursor-col-resize"
            onMouseDown={(event) => {
              dragStateRef.current = {
                startX: event.clientX,
                startWidth: width,
              }
              document.body.style.cursor = 'col-resize'
              document.body.style.userSelect = 'none'
            }}
          >
            <div className="mx-auto h-full w-px bg-transparent transition hover:bg-[var(--editor-accent)]/40" />
          </div>

          <div className="flex h-full min-h-0 flex-col">
            <div className="flex items-center gap-1 border-b border-[var(--editor-line)] px-3 py-3">
              <button
                type="button"
                onClick={() => onActiveTabChange('settings')}
                className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition ${
                  activeTab === 'settings'
                    ? 'bg-[var(--editor-ink)] text-white'
                    : 'text-[var(--editor-muted)] hover:bg-[var(--editor-soft)] hover:text-[var(--editor-ink)]'
                }`}
              >
                <Settings2 className="h-3.5 w-3.5" />
                设置
              </button>
              <button
                type="button"
                onClick={() => onActiveTabChange('ai')}
                className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition ${
                  activeTab === 'ai'
                    ? 'bg-[var(--editor-ink)] text-white'
                    : 'text-[var(--editor-muted)] hover:bg-[var(--editor-soft)] hover:text-[var(--editor-ink)]'
                }`}
              >
                <MessageSquare className="h-3.5 w-3.5" />
                AI
              </button>

              <button
                type="button"
                onClick={onClose}
                className="ml-auto inline-flex h-8 w-8 items-center justify-center rounded-lg text-[var(--editor-muted)] transition hover:bg-[var(--editor-soft)] hover:text-[var(--editor-ink)]"
                title="收起侧边栏"
              >
                <PanelRightClose className="h-4 w-4" />
              </button>
            </div>

            <div className="min-h-0 flex-1 overflow-hidden">
              {activeTab === 'settings' ? settingsContent : aiContent}
            </div>
          </div>
        </>
      ) : null}
    </aside>
  )
}

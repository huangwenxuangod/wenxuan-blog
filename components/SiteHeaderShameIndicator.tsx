'use client'

import { useEffect, useRef, useState } from 'react'
import { cx } from '@/components/ui/primitives'
import type { WeeklyWritingStats, ShameMessage } from '@/lib/writing-shamer'

export function SiteHeaderShameIndicator() {
  const [stats, setStats] = useState<WeeklyWritingStats | null>(null)
  const [messages, setMessages] = useState<ShameMessage[]>([])
  const [popoverOpen, setPopoverOpen] = useState(false)
  const popoverRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    let cancelled = false
    fetch('/api/admin/writing-stats')
      .then(async (res) => res.json())
      .then((data: { stats: WeeklyWritingStats; messages: ShameMessage[] }) => {
        if (cancelled) return
        setStats(data.stats)
        setMessages(data.messages)
      })
      .catch(() => {})
    return () => { cancelled = true }
  }, [])

  // 点击外部关闭 popover
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (
        popoverRef.current &&
        !popoverRef.current.contains(e.target as Node) &&
        triggerRef.current &&
        !triggerRef.current.contains(e.target as Node)
      ) {
        setPopoverOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  if (!stats || stats.met || messages.length === 0) return null

  const deficit = stats.goal - stats.publishedCount
  const msg = messages[0]
  const progress = stats.publishedCount / stats.goal

  return (
    <>
      {/* 桌面端：内联显示 */}
      <div className="hidden sm:flex items-center gap-2 shrink-0">
        <div className="flex items-center gap-1.5">
          <span className="text-xs" aria-hidden="true">📡</span>
          <span className={cx(
            'text-xs font-medium whitespace-nowrap',
            deficit >= 3 ? 'text-red-400' : deficit >= 1 ? 'text-orange-400' : 'text-yellow-400',
          )}>
            {stats.publishedCount}/{stats.goal}
          </span>
        </div>
        <div className="w-12 h-1 rounded-full bg-[var(--editor-line)] overflow-hidden">
          <div
            className={cx(
              'h-full rounded-full transition-all duration-500',
              deficit >= 3 ? 'bg-red-500' : deficit >= 1 ? 'bg-orange-500' : 'bg-yellow-500',
            )}
            style={{ width: `${Math.min(100, progress * 100)}%` }}
          />
        </div>
        <span className={cx(
          'text-[11px] leading-none max-w-[140px] truncate hidden lg:inline',
          'text-[var(--editor-muted)]',
        )}>
          {msg.title}{msg.subtitle ? ' ' + msg.subtitle : ''}
        </span>
      </div>

      {/* 移动端：trigger 按钮 + popover */}
      <div className="sm:hidden relative">
        <button
          ref={triggerRef}
          type="button"
          onClick={() => setPopoverOpen(!popoverOpen)}
          className={cx(
            'p-1.5 rounded-md transition-colors',
            'text-[var(--editor-muted)] hover:text-[var(--editor-ink)] hover:bg-[var(--editor-panel)]',
          )}
          aria-label="写作进度"
        >
          <span className="text-sm">📡</span>
          <span className={cx(
            'ml-1 text-xs font-mono',
            deficit >= 3 ? 'text-red-400' : deficit >= 1 ? 'text-orange-400' : 'text-yellow-400',
          )}>
            {stats.publishedCount}
          </span>
        </button>

        {popoverOpen && (
          <div
            ref={popoverRef}
            className="absolute right-0 top-full mt-2 w-64 p-3 rounded-lg border border-[var(--editor-line)] bg-[var(--background)] shadow-lg z-50"
          >
            <div className="text-xs text-[var(--editor-muted)] mb-2">
              <span className="font-medium text-[var(--editor-ink)]">{msg.title}</span>
              {' '}{msg.subtitle}
            </div>
            <div className="flex items-center gap-2">
              <div className="flex-1 h-1.5 rounded-full bg-[var(--editor-line)] overflow-hidden">
                <div
                  className={cx(
                    'h-full rounded-full transition-all duration-500',
                    deficit >= 3 ? 'bg-red-500' : deficit >= 1 ? 'bg-orange-500' : 'bg-yellow-500',
                  )}
                  style={{ width: `${Math.min(100, progress * 100)}%` }}
                />
              </div>
              <span className={cx(
                'text-xs font-mono whitespace-nowrap',
                deficit >= 3 ? 'text-red-400' : deficit >= 1 ? 'text-orange-400' : 'text-yellow-400',
              )}>
                {stats.publishedCount}/{stats.goal}
              </span>
            </div>
          </div>
        )}
      </div>
    </>
  )
}

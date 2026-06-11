'use client'

import { useEffect, useRef, useState } from 'react'
import { Target } from 'lucide-react'
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

  const colorClass = deficit >= 3 ? 'text-red-400' : deficit >= 1 ? 'text-orange-400' : 'text-yellow-400'
  const barColorClass = deficit >= 3 ? 'bg-red-500' : deficit >= 1 ? 'bg-orange-500' : 'bg-yellow-500'

  const shameText = `${msg.title}${msg.subtitle ? ' ' + msg.subtitle : ''}`

  return (
    <div className="relative shrink-0">
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setPopoverOpen(!popoverOpen)}
        className={cx(
          'flex items-center gap-1.5 px-2 py-1 rounded-md transition-colors text-left',
          'hover:bg-[var(--editor-panel)]',
          popoverOpen && 'bg-[var(--editor-panel)]',
        )}
        aria-label="写作进度"
      >
        <Target className={cx('w-3.5 h-3.5 shrink-0', colorClass)} />
        <span className={cx('text-xs font-mono tabular-nums shrink-0', colorClass)}>
          {stats.publishedCount}/{stats.goal}
        </span>
        <div className="w-12 h-1 rounded-full bg-[var(--editor-line)] overflow-hidden shrink-0">
          <div
            className={cx('h-full rounded-full transition-all duration-500', barColorClass)}
            style={{ width: `${Math.min(100, progress * 100)}%` }}
          />
        </div>
        <span className={cx('text-xs leading-tight hidden sm:inline', 'text-[var(--editor-muted)]')}>
          {shameText}
        </span>
      </button>

      {popoverOpen && (
        <div
          ref={popoverRef}
          className="absolute right-0 top-full mt-2 w-72 sm:w-80 p-3 rounded-lg border border-[var(--editor-line)] bg-[var(--background)] shadow-lg z-50"
        >
          <div className="text-sm leading-relaxed text-[var(--editor-muted)]">
            {shameText}
          </div>
          <div className="mt-3 flex items-center gap-2">
            <div className="flex-1 h-1.5 rounded-full bg-[var(--editor-line)] overflow-hidden">
              <div
                className={cx('h-full rounded-full transition-all duration-500', barColorClass)}
                style={{ width: `${Math.min(100, progress * 100)}%` }}
              />
            </div>
            <span className={cx('text-xs font-mono tabular-nums', colorClass)}>
              {stats.publishedCount}/{stats.goal}
            </span>
          </div>
        </div>
      )}
    </div>
  )
}

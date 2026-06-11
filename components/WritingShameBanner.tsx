'use client'

import { useEffect, useState } from 'react'
import { cx } from '@/components/ui/primitives'
import type { WeeklyWritingStats, ShameMessage } from '@/lib/writing-shamer'

export function WritingShameBanner() {
  const [stats, setStats] = useState<WeeklyWritingStats | null>(null)
  const [messages, setMessages] = useState<ShameMessage[]>([])
  const [loading, setLoading] = useState(true)

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
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => { cancelled = true }
  }, [])

  if (loading || !stats || stats.met || messages.length === 0) {
    return null
  }

  const msg = messages[0]

  const styleConfig = {
    cold: {
      bg: 'bg-red-950/40 border-red-900/40',
      text: 'text-red-200',
      accent: 'text-red-400',
      bar: 'bg-red-900/50',
      fill: 'bg-red-600',
    },
    fierce: {
      bg: 'bg-orange-950/40 border-orange-800/50',
      text: 'text-orange-100',
      accent: 'text-orange-400',
      bar: 'bg-orange-900/50',
      fill: 'bg-orange-600',
    },
    tease: {
      bg: 'bg-yellow-950/30 border-yellow-800/40',
      text: 'text-yellow-200',
      accent: 'text-yellow-400',
      bar: 'bg-yellow-900/40',
      fill: 'bg-yellow-600',
    },
    data: {
      bg: 'bg-neutral-950/40 border-neutral-800/40',
      text: 'text-neutral-300',
      accent: 'text-neutral-400',
      bar: 'bg-neutral-800/50',
      fill: 'bg-neutral-500',
    },
  }

  const sc = styleConfig[msg.style]

  return (
    <div className={cx(
      'relative border-b backdrop-blur-sm transition-all duration-300',
      sc.bg,
    )}>
      <div className="mx-auto max-w-6xl px-4 sm:px-6 py-3">
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-lg" aria-hidden="true">📡</span>
              <span className={cx('font-medium text-sm sm:text-base', sc.text)}>
                {msg.title}
              </span>
            </div>
            <p className={cx('text-xs sm:text-sm mt-0.5', sc.accent)}>
              {msg.subtitle}
            </p>

            <div className="mt-2 flex items-center gap-3">
              <div className={cx('flex-1 h-1.5 rounded-full overflow-hidden', sc.bar)}>
                <div
                  className={cx('h-full rounded-full transition-all duration-500', sc.fill)}
                  style={{ width: `${Math.min(100, (stats.publishedCount / stats.goal) * 100)}%` }}
                />
              </div>
              <span className={cx('text-xs font-mono whitespace-nowrap', sc.text)}>
                {stats.publishedCount}/{stats.goal}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

'use client'

import { ExternalLink, Loader2, Newspaper } from 'lucide-react'
import { useEffect, useState } from 'react'
import type { AihotDailyRecord } from '@/lib/aihot-daily'

type DailyResponse =
  | {
      daily: AihotDailyRecord
      status: 'ready'
    }
  | {
      daily: null
      status: 'empty'
    }

function formatDateLabel(value: string) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleDateString('zh-CN', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })
}

export function AihotDailyPageClient() {
  const [loading, setLoading] = useState(true)
  const [daily, setDaily] = useState<AihotDailyRecord | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false

    const load = async () => {
      setLoading(true)
      setError(null)

      try {
        const response = await fetch('/api/aihot/daily', {
          credentials: 'same-origin',
        })
        const payload = (await response.json().catch(() => ({}))) as DailyResponse & {
          error?: string
        }

        if (!response.ok) {
          throw new Error(payload.error || '读取 AI 日报失败')
        }

        if (!cancelled) {
          setDaily(payload.daily ?? null)
        }
      } catch (fetchError) {
        if (!cancelled) {
          setError(fetchError instanceof Error ? fetchError.message : '读取 AI 日报失败')
        }
      } finally {
        if (!cancelled) {
          setLoading(false)
        }
      }
    }

    void load()

    return () => {
      cancelled = true
    }
  }, [])

  if (loading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center text-sm text-[var(--editor-muted)]">
        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
        正在载入 AI 日报
      </div>
    )
  }

  if (error) {
    return (
      <div className="rounded-[1.5rem] border border-[var(--editor-line)] bg-[var(--editor-panel)] px-5 py-10 text-center">
        <p className="text-base font-medium text-[var(--editor-ink)]">AI 日报读取失败</p>
        <p className="mt-2 text-sm text-[var(--editor-muted)]">{error}</p>
      </div>
    )
  }

  if (!daily) {
    return (
      <div className="rounded-[1.5rem] border border-[var(--editor-line)] bg-[var(--editor-panel)] px-5 py-10 text-center">
        <p className="text-base font-medium text-[var(--editor-ink)]">AI 日报暂未同步</p>
        <p className="mt-2 text-sm text-[var(--editor-muted)]">等待北京时间 08:00 定时拉取，或先手动同步一次。</p>
      </div>
    )
  }

  return (
    <div className="space-y-10">
      <section className="border-b border-[var(--editor-line)] pb-8">
        <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-[var(--editor-line)] bg-[var(--editor-panel)] px-3 py-1 text-[11px] tracking-[0.14em] text-[var(--editor-muted)]">
          <Newspaper className="h-3.5 w-3.5" />
          AI DAILY
        </div>
        <h1
          className="text-3xl font-bold leading-tight text-[var(--editor-ink)] sm:text-4xl"
          style={{ fontFamily: 'Georgia, "Noto Serif SC", serif' }}
        >
          AI 日报
        </h1>
        <p className="mt-3 text-sm text-[var(--editor-muted)]">{formatDateLabel(daily.date)}</p>
        {daily.leadTitle ? (
          <div className="mt-6 space-y-3">
            <h2
              className="text-xl font-semibold leading-9 text-[var(--editor-ink)] sm:text-2xl"
              style={{ fontFamily: 'Georgia, "Noto Serif SC", serif' }}
            >
              {daily.leadTitle}
            </h2>
            {daily.leadParagraph ? (
              <p className="max-w-3xl text-[15px] leading-8 text-[var(--editor-muted)]">
                {daily.leadParagraph}
              </p>
            ) : null}
          </div>
        ) : null}
      </section>

      <div className="space-y-0">
        {daily.sections.map((section) => (
          <section key={section.label} className="border-t border-[var(--editor-line)] first:border-t-0">
            <div className="py-6 sm:py-7">
              <div className="mb-4 text-xs font-medium uppercase tracking-[0.16em] text-[var(--editor-muted)]">
                {section.label}
              </div>
              <div className="space-y-0">
                {section.items.map((item) => (
                  <article
                    key={`${section.label}-${item.sourceUrl}`}
                    className="group border-t border-[var(--editor-line)] first:border-t-0"
                  >
                    <a
                      href={item.sourceUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="block py-5 transition-all duration-200 hover:bg-[var(--editor-panel)] hover:pl-4"
                    >
                      <h3
                        className="flex items-start gap-2 text-lg font-semibold leading-8 text-[var(--editor-ink)] transition-colors duration-200 group-hover:text-[var(--editor-accent)]"
                        style={{ fontFamily: 'Georgia, "Noto Serif SC", serif' }}
                      >
                        <span>{item.title}</span>
                        <ExternalLink className="mt-1 h-4 w-4 shrink-0 opacity-55 transition group-hover:opacity-100" />
                      </h3>
                      {item.summary ? (
                        <p className="mt-2 text-sm leading-7 text-[var(--editor-muted)]">{item.summary}</p>
                      ) : null}
                      {item.sourceName ? (
                        <div className="mt-3 text-xs text-[var(--stone-gray)]">{item.sourceName}</div>
                      ) : null}
                    </a>
                  </article>
                ))}
              </div>
            </div>
          </section>
        ))}
      </div>
    </div>
  )
}

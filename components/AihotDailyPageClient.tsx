'use client'

import Link from 'next/link'
import { ExternalLink, Loader2, Newspaper } from 'lucide-react'
import { useMemo } from 'react'
import type { AihotDailyListItem, AihotDailyRecord } from '@/lib/aihot-daily'
import { cx } from '@/components/ui/primitives'

function formatDateLabel(value: string) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleDateString('zh-CN', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    weekday: 'long',
  })
}

function formatMonthGroup(value: string) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value.slice(0, 7)
  return `${date.getFullYear()} 年 ${date.getMonth() + 1} 月`
}

function formatDayLabel(value: string) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return `${date.getDate()} 日`
}

function buildFallbackTitle(item: AihotDailyListItem) {
  return item.leadTitle?.trim() || 'AI 日报'
}

export function AihotDailyPageClient({
  daily,
  archive,
  selectedDate,
}: {
  daily: AihotDailyRecord | null
  archive: AihotDailyListItem[]
  selectedDate: string | null
}) {
  const groupedArchive = useMemo(() => {
    const groups = new Map<string, AihotDailyListItem[]>()
    for (const item of archive) {
      const key = formatMonthGroup(item.date)
      const current = groups.get(key)
      if (current) {
        current.push(item)
      } else {
        groups.set(key, [item])
      }
    }
    return Array.from(groups.entries())
  }, [archive])

  if (!daily && archive.length === 0) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <div className="flex items-center gap-2 text-[var(--editor-muted)]">
          <Loader2 className="h-4 w-4 animate-spin" />
          <div className="flex items-center gap-1">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-current [animation-delay:0ms]" />
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-current [animation-delay:180ms]" />
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-current [animation-delay:360ms]" />
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="flex w-full flex-col gap-8 lg:min-h-[calc(100vh-11rem)] lg:flex-row lg:gap-0">
      <aside className="w-full shrink-0 lg:w-[272px] lg:border-r lg:border-[var(--editor-line)] lg:pr-4">
        <div className="lg:sticky lg:top-24">
          <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-[var(--editor-line)] bg-[var(--editor-panel)] px-3 py-1 text-[11px] tracking-[0.14em] text-[var(--editor-muted)]">
            <Newspaper className="h-3.5 w-3.5" />
            AI DAILY
          </div>
          <div className="editor-scroll-shell max-h-[68vh] overflow-y-auto pr-1 lg:max-h-[calc(100vh-11rem)]">
            <div className="space-y-6">
              {groupedArchive.map(([groupLabel, items]) => (
                <section key={groupLabel}>
                  <div className="mb-2 flex items-center justify-between px-2">
                    <h2 className="text-[12px] font-medium tracking-[0.08em] text-[var(--editor-muted)]">
                      {groupLabel}
                    </h2>
                    <span className="text-[11px] text-[var(--stone-gray)]">{items.length}</span>
                  </div>
                  <div className="space-y-1">
                    {items.map((item) => {
                      const active = item.date === (selectedDate || daily?.date || null)
                      return (
                        <Link
                          key={item.date}
                          href={`/ai-daily?date=${encodeURIComponent(item.date)}`}
                          className={cx(
                            'group block rounded-[0.95rem] border border-transparent px-3 py-3 transition',
                            active
                              ? 'border-[color-mix(in_srgb,var(--editor-accent)_14%,var(--editor-line))] bg-[color-mix(in_srgb,var(--editor-accent)_7%,var(--editor-panel))]'
                              : 'hover:bg-[var(--editor-panel)]',
                          )}
                        >
                          <div className="flex items-start gap-3">
                            <div
                              className={cx(
                                'min-w-[3rem] pt-0.5 text-[13px] font-medium',
                                active ? 'text-[var(--editor-accent)]' : 'text-[var(--editor-muted)]',
                              )}
                            >
                              {formatDayLabel(item.date)}
                            </div>
                            <div className="min-w-0 flex-1">
                              <div
                                className={cx(
                                  'line-clamp-2 text-[13px] leading-6 transition-colors',
                                  active
                                    ? 'font-semibold text-[var(--editor-ink)]'
                                    : 'text-[color-mix(in_srgb,var(--editor-ink)_86%,var(--editor-muted))] group-hover:text-[var(--editor-ink)]',
                                )}
                              >
                                {buildFallbackTitle(item)}
                              </div>
                            </div>
                          </div>
                        </Link>
                      )
                    })}
                  </div>
                </section>
              ))}
            </div>
          </div>
        </div>
      </aside>

      <div className="min-w-0 flex-1 lg:pl-10">
        {daily ? (
          <div className="space-y-10">
            <section className="border-b border-[var(--editor-line)] pb-8">
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
        ) : null}
      </div>
    </div>
  )
}

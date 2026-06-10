'use client'

import { Dialog, DialogBackdrop, DialogPanel, DialogTitle } from '@headlessui/react'
import { ExternalLink, Loader2, Newspaper, X } from 'lucide-react'
import { useEffect, useState } from 'react'
import { UiIconButton } from '@/components/ui/primitives'
import { useToast } from '@/components/Toast'

interface AihotDailyModalProps {
  isOpen: boolean
  onClose: () => void
}

interface AihotDailyItem {
  title: string
  summary: string
  sourceUrl: string
  sourceName: string
}

interface AihotDailySection {
  label: string
  items: AihotDailyItem[]
}

interface AihotDailyRecord {
  date: string
  generatedAt: string
  leadTitle: string | null
  leadParagraph: string | null
  sections: AihotDailySection[]
  sourceUrl: string
}

export function AihotDailyModal({
  isOpen,
  onClose,
}: AihotDailyModalProps) {
  const toast = useToast()
  const [loading, setLoading] = useState(false)
  const [daily, setDaily] = useState<AihotDailyRecord | null>(null)

  useEffect(() => {
    if (!isOpen || daily || loading) return

    let cancelled = false

    const load = async () => {
      setLoading(true)
      try {
        const response = await fetch('/api/aihot/daily', {
          credentials: 'same-origin',
        })
        const payload = await response.json().catch(() => ({})) as {
          error?: string
          daily?: AihotDailyRecord
        }

        if (!response.ok || !payload.daily) {
          throw new Error(payload.error || 'AI 日报暂未同步')
        }

        if (!cancelled) {
          setDaily(payload.daily)
        }
      } catch (error) {
        if (!cancelled) {
          toast.error(error instanceof Error ? error.message : '读取 AI 日报失败')
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
  }, [daily, isOpen, loading, toast])

  return (
    <Dialog open={isOpen} onClose={onClose} className="relative z-[90]">
      <DialogBackdrop className="fixed inset-0 bg-black/35 transition duration-200 data-[closed]:opacity-0" />

      <div className="fixed inset-0 flex items-start justify-center p-4 pt-20 sm:pt-24">
        <DialogPanel className="ui-modal-panel modal-scrollbar-none flex max-h-[82vh] w-full max-w-3xl flex-col overflow-y-auto rounded-[1.6rem] px-5 py-5 sm:px-6">
          <div className="mb-5 flex items-start justify-between gap-4">
            <div className="min-w-0">
              <div className="mb-2 inline-flex items-center gap-2 rounded-full border border-[color-mix(in_srgb,var(--ui-line)_88%,transparent)] bg-[color-mix(in_srgb,var(--ui-bg)_90%,var(--ui-soft))] px-3 py-1 text-[11px] tracking-[0.14em] text-[var(--ui-muted)]">
                <Newspaper className="h-3.5 w-3.5" />
                AI DAILY
              </div>
              <DialogTitle className="text-[1.45rem] font-semibold tracking-tight text-[var(--ui-ink)]">
                AI 日报
              </DialogTitle>
              {daily?.date ? (
                <p className="mt-1 text-sm text-[var(--ui-muted)]">{daily.date}</p>
              ) : null}
            </div>

            <UiIconButton
              aria-label="关闭 AI 日报"
              tone="quiet"
              onClick={onClose}
              className="h-9 w-9"
            >
              <X className="h-4 w-4" />
            </UiIconButton>
          </div>

          {loading && !daily ? (
            <div className="flex items-center justify-center py-16 text-sm text-[var(--ui-muted)]">
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              正在载入 AI 日报
            </div>
          ) : daily ? (
            <div className="space-y-6">
              {daily.leadTitle ? (
                <section className="rounded-[1.35rem] border border-[color-mix(in_srgb,var(--ui-line)_88%,transparent)] bg-[color-mix(in_srgb,var(--ui-bg)_90%,var(--ui-soft))] px-4 py-4">
                  <h3 className="text-lg font-semibold leading-7 text-[var(--ui-ink)]">{daily.leadTitle}</h3>
                  {daily.leadParagraph ? (
                    <p className="mt-2 text-sm leading-7 text-[var(--ui-muted)]">{daily.leadParagraph}</p>
                  ) : null}
                </section>
              ) : null}

              {daily.sections.map((section) => (
                <section key={section.label}>
                  <h4 className="mb-3 text-sm font-semibold tracking-[0.08em] text-[var(--ui-muted)]">
                    {section.label}
                  </h4>
                  <div className="space-y-3">
                    {section.items.map((item) => (
                      <article
                        key={`${section.label}-${item.sourceUrl}`}
                        className="rounded-[1.2rem] border border-[color-mix(in_srgb,var(--ui-line)_88%,transparent)] bg-[var(--ui-bg)] px-4 py-4"
                      >
                        <a
                          href={item.sourceUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="group inline-flex items-start gap-2 text-[15px] font-medium leading-7 text-[var(--ui-ink)] transition hover:text-[var(--ui-accent)]"
                        >
                          <span>{item.title}</span>
                          <ExternalLink className="mt-1 h-4 w-4 shrink-0 opacity-55 transition group-hover:opacity-100" />
                        </a>
                        {item.summary ? (
                          <p className="mt-2 text-sm leading-7 text-[var(--ui-muted)]">{item.summary}</p>
                        ) : null}
                        <div className="mt-3 text-xs text-[var(--ui-muted)]">{item.sourceName}</div>
                      </article>
                    ))}
                  </div>
                </section>
              ))}
            </div>
          ) : (
            <div className="py-12 text-center text-sm text-[var(--ui-muted)]">
              AI 日报暂未同步
            </div>
          )}
        </DialogPanel>
      </div>
    </Dialog>
  )
}

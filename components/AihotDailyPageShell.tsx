'use client'

import dynamic from 'next/dynamic'
import type { AihotDailyListItem, AihotDailyRecord } from '@/lib/aihot-daily'

const AihotDailyPageClient = dynamic(
  () => import('@/components/AihotDailyPageClient').then((module) => module.AihotDailyPageClient),
  {
    ssr: false,
    loading: () => (
      <div className="flex min-h-[40vh] items-center justify-center text-sm text-[var(--editor-muted)]">
        正在载入 AI 日报
      </div>
    ),
  },
)

export function AihotDailyPageShell({
  daily,
  archive,
  selectedDate,
}: {
  daily: AihotDailyRecord | null
  archive: AihotDailyListItem[]
  selectedDate: string | null
}) {
  return <AihotDailyPageClient daily={daily} archive={archive} selectedDate={selectedDate} />
}

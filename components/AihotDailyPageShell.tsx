'use client'

import dynamic from 'next/dynamic'

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

export function AihotDailyPageShell() {
  return <AihotDailyPageClient />
}

'use client'

import Link from 'next/link'
import { Newspaper } from 'lucide-react'
import { Tooltip } from '@/components/ui/Tooltip'

export function AihotDailyTrigger() {
  return (
    <Tooltip content="AI 日报" tone="editor">
      <Link
        href="/ai-daily"
        className="inline-flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded-full text-[var(--editor-muted)] transition-colors duration-150 hover:text-[var(--editor-ink)]"
        aria-label="打开 AI 日报"
      >
          <Newspaper className="h-[16px] w-[16px]" />
      </Link>
    </Tooltip>
  )
}

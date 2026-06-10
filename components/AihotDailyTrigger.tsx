'use client'

import dynamic from 'next/dynamic'
import { Newspaper } from 'lucide-react'
import { useState } from 'react'
import { Tooltip } from '@/components/ui/Tooltip'

const AihotDailyModal = dynamic(
  () => import('@/components/AihotDailyModal').then((module) => module.AihotDailyModal),
  { ssr: false },
)

export function AihotDailyTrigger() {
  const [open, setOpen] = useState(false)

  return (
    <>
      <Tooltip content="AI 日报" tone="editor">
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="inline-flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded-full text-[var(--editor-muted)] transition-colors duration-150 hover:text-[var(--editor-ink)]"
          aria-label="打开 AI 日报"
        >
          <Newspaper className="h-[16px] w-[16px]" />
        </button>
      </Tooltip>

      <AihotDailyModal isOpen={open} onClose={() => setOpen(false)} />
    </>
  )
}

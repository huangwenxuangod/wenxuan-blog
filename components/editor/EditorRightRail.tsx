'use client'

import type { ReactNode } from 'react'
import { PanelRightClose } from 'lucide-react'
import { UiIconButton, UiPanel } from '@/components/ui/primitives'

interface EditorRightRailProps {
  open: boolean
  onClose: () => void
  settingsContent?: ReactNode
  aiContent: ReactNode
}

export function EditorRightRail({
  open,
  onClose,
  aiContent,
}: EditorRightRailProps) {
  return (
    <aside
      className={`shrink-0 bg-[var(--background)] transition-[width,opacity] duration-200 ease-in-out ${
        open ? 'opacity-100' : 'overflow-hidden opacity-0'
      }`}
      style={{
        width: open ? 372 : 0,
        position: 'sticky',
        top: '3.5rem',
        height: 'calc(100vh - 3.5rem)',
      }}
    >
      {open ? (
        <div className="flex h-full min-h-0 flex-col px-4 py-4">
          <UiPanel className="flex h-full min-h-0 flex-col rounded-[1.75rem] px-4 py-4">
            <div className="flex items-center gap-3 pb-3">
              <div className="text-[13px] font-medium tracking-[0.01em] text-[var(--editor-ink)]">
                Chat
              </div>
              <UiIconButton
                onClick={onClose}
                className="ml-auto h-10 w-10"
                title="收起 AI 对话"
                aria-label="收起 AI 对话"
              >
                <PanelRightClose className="h-[1.15rem] w-[1.15rem]" />
              </UiIconButton>
            </div>

            <div className="min-h-0 flex-1 overflow-hidden">
              {aiContent}
            </div>
          </UiPanel>
        </div>
      ) : null}
    </aside>
  )
}

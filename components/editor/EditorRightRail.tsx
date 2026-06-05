'use client'

import type { ReactNode } from 'react'
import { PanelRightClose, Settings2 } from 'lucide-react'

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
        width: open ? 340 : 0,
        position: 'sticky',
        top: '3.5rem',
        height: 'calc(100vh - 3.5rem)',
      }}
    >
      {open ? (
        <div className="flex h-full min-h-0 flex-col">
          <div className="flex items-center gap-3 px-5 py-4">
            <button
              type="button"
              className="editor-quiet-icon-button h-8 w-8 cursor-pointer"
              title="对话设置"
            >
              <Settings2 className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={onClose}
              className="editor-quiet-icon-button ml-auto h-8 w-8 cursor-pointer"
              title="收起侧边栏"
            >
              <PanelRightClose className="h-4 w-4" />
            </button>
          </div>

          <div className="min-h-0 flex-1 overflow-hidden">
            {aiContent}
          </div>
        </div>
      ) : null}
    </aside>
  )
}

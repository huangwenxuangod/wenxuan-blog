'use client'

import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { PanelRightClose } from 'lucide-react'
import { UiIconButton } from '@/components/ui/primitives'
import { Tooltip } from '@/components/ui/Tooltip'

interface EditorRightRailProps {
  open: boolean
  onClose: () => void
  width: number
  onWidthChange: (width: number) => void
  headerAccessory?: ReactNode
  settingsContent?: ReactNode
  aiContent: ReactNode
}

const MIN_WIDTH = 320
const MAX_WIDTH = 640

export function EditorRightRail({
  open,
  onClose,
  width,
  onWidthChange,
  headerAccessory,
  aiContent,
}: EditorRightRailProps) {
  const [isResizing, setIsResizing] = useState(false)
  const activePointerIdRef = useRef<number | null>(null)

  const clampWidth = useCallback((nextWidth: number) => {
    return Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, nextWidth))
  }, [])

  useEffect(() => {
    if (!isResizing) return

    const previousUserSelect = document.body.style.userSelect
    const previousCursor = document.body.style.cursor
    document.body.style.userSelect = 'none'
    document.body.style.cursor = 'col-resize'

    return () => {
      document.body.style.userSelect = previousUserSelect
      document.body.style.cursor = previousCursor
    }
  }, [isResizing])

  const stopResizing = useCallback(() => {
    activePointerIdRef.current = null
    setIsResizing(false)
  }, [])

  useEffect(() => {
    if (!isResizing) return

    const handlePointerMove = (event: PointerEvent) => {
      if (activePointerIdRef.current !== event.pointerId) return
      onWidthChange(clampWidth(window.innerWidth - event.clientX))
    }

    const handlePointerUp = (event: PointerEvent) => {
      if (activePointerIdRef.current !== event.pointerId) return
      stopResizing()
    }

    window.addEventListener('pointermove', handlePointerMove)
    window.addEventListener('pointerup', handlePointerUp)
    window.addEventListener('pointercancel', handlePointerUp)

    return () => {
      window.removeEventListener('pointermove', handlePointerMove)
      window.removeEventListener('pointerup', handlePointerUp)
      window.removeEventListener('pointercancel', handlePointerUp)
    }
  }, [clampWidth, isResizing, onWidthChange, stopResizing])

  const handlePointerDown = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    if (!open) return

    activePointerIdRef.current = event.pointerId
    setIsResizing(true)
    event.preventDefault()
  }, [open])

  return (
    <aside
      className={`absolute right-0 top-0 z-30 bg-[var(--ui-bg)] ${
        isResizing ? '' : 'transition-[width,opacity] duration-200 ease-in-out'
      } ${
        open ? 'opacity-100' : 'pointer-events-none overflow-hidden opacity-0'
      }`}
      style={{
        width: open ? width : 0,
        height: '100%',
      }}
    >
      {open ? (
        <>
          <div
            role="separator"
            aria-orientation="vertical"
            aria-label="调整 AI 栏宽度"
            onPointerDown={handlePointerDown}
            className="absolute inset-y-0 left-0 z-20 w-3 -translate-x-1/2 cursor-col-resize touch-none"
          >
            <div className="mx-auto h-full w-px bg-[color-mix(in_srgb,var(--ui-line)_78%,transparent)] transition-colors duration-150 hover:bg-[color-mix(in_srgb,var(--ui-line-strong)_72%,transparent)]" />
          </div>

          <div className="flex h-full min-h-0 flex-col border-l border-[color-mix(in_srgb,var(--ui-line)_72%,transparent)] bg-[color-mix(in_srgb,var(--ui-bg)_100%,transparent)] px-6 py-5">
            <div className="flex items-center justify-end gap-1 pb-3">
              {headerAccessory}
              <Tooltip content="收起 AI 对话">
                <UiIconButton
                  onClick={onClose}
                  className="h-10 w-10 opacity-78"
                  aria-label="收起 AI 对话"
                >
                  <PanelRightClose className="h-[1.15rem] w-[1.15rem]" />
                </UiIconButton>
              </Tooltip>
            </div>

            <div className="min-h-0 flex-1 overflow-hidden">
              {aiContent}
            </div>
          </div>
        </>
      ) : null}
    </aside>
  )
}

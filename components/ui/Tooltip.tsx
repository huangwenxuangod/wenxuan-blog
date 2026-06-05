'use client'

import React, { useState, useRef, useEffect } from 'react'
import { Transition, Portal } from '@headlessui/react'

export interface TooltipProps {
  /** The text or node to display inside the tooltip */
  content: React.ReactNode
  /** The interactive element that triggers the tooltip on hover or focus */
  children: React.ReactElement
  /** Delay in milliseconds before the tooltip appears (default: 150) */
  delay?: number
  /** Custom class name for styling the tooltip bubble */
  className?: string
  /** Whether the tooltip is disabled */
  disabled?: boolean
  /** Which token system to use for tooltip styling */
  tone?: 'ui' | 'editor'
}

export function Tooltip({
  content,
  children,
  delay = 150,
  className = '',
  disabled = false,
  tone = 'ui',
}: TooltipProps) {
  const [isVisible, setIsVisible] = useState(false)
  const [position, setPosition] = useState<'top' | 'bottom'>('top')
  const [coords, setCoords] = useState({ top: 0, left: 0 })
  const timeoutRef = useRef<NodeJS.Timeout | null>(null)

  const showTooltip = (e: React.MouseEvent | React.FocusEvent) => {
    if (disabled || !content) return

    // Calculate absolute position relative to viewport
    const rect = e.currentTarget.getBoundingClientRect()
    const centerX = rect.left + rect.width / 2

    // If the trigger is within 55px of the top of the viewport,
    // we force the tooltip to show at the bottom to avoid being clipped.
    const spaceAtTop = rect.top
    const chosenPosition = spaceAtTop < 55 ? 'bottom' : 'top'
    setPosition(chosenPosition)

    if (chosenPosition === 'top') {
      setCoords({
        left: centerX,
        top: rect.top - 8, // 8px gap above the trigger
      })
    } else {
      setCoords({
        left: centerX,
        top: rect.bottom + 8, // 8px gap below the trigger
      })
    }

    if (timeoutRef.current) clearTimeout(timeoutRef.current)
    timeoutRef.current = setTimeout(() => {
      setIsVisible(true)
    }, delay)
  }

  const hideTooltip = () => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current)
    setIsVisible(false)
  }

  // Hide tooltip on window scroll or resize to prevent detaching
  useEffect(() => {
    if (!isVisible) return

    const handleScrollOrResize = () => {
      setIsVisible(false)
    }

    window.addEventListener('scroll', handleScrollOrResize, { passive: true })
    window.addEventListener('resize', handleScrollOrResize, { passive: true })

    return () => {
      window.removeEventListener('scroll', handleScrollOrResize)
      window.removeEventListener('resize', handleScrollOrResize)
    }
  }, [isVisible])

  useEffect(() => {
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current)
    }
  }, [])

  if (disabled || !content) {
    return children
  }

  const bubbleClassName = tone === 'editor'
    ? 'bg-[var(--editor-ink)] text-[var(--background)]'
    : 'bg-[var(--ui-ink)] text-[var(--ui-bg)]'

  const caretClassName = tone === 'editor'
    ? position === 'top'
      ? 'top-full border-t-[var(--editor-ink)]'
      : 'bottom-full border-b-[var(--editor-ink)]'
    : position === 'top'
      ? 'top-full border-t-[var(--ui-ink)]'
      : 'bottom-full border-b-[var(--ui-ink)]'

  return (
    <>
      <div
        className="relative inline-flex"
        onMouseEnter={showTooltip}
        onMouseLeave={hideTooltip}
        onFocus={showTooltip}
        onBlur={hideTooltip}
      >
        {children}
      </div>

      <Portal>
        <Transition
          show={isVisible}
          as="div"
          enter="transition ease-out duration-100"
          enterFrom="opacity-0 scale-95"
          enterTo="opacity-100 scale-100"
          leave="transition ease-in duration-75"
          leaveFrom="opacity-100 scale-100"
          leaveTo="opacity-0 scale-95"
          style={{
            position: 'fixed',
            left: coords.left,
            top: coords.top,
          }}
          className={`z-[9999] whitespace-nowrap pointer-events-none ${
            position === 'top' ? '-translate-x-1/2 -translate-y-full' : '-translate-x-1/2'
          }`}
        >
          <div
            className={`relative rounded-lg px-2.5 py-1.5 text-[11px] font-medium leading-none shadow-md transition-colors duration-150 ${bubbleClassName} ${className}`}
          >
            {content}
            {/* Caret Arrow */}
            <div
              className={`absolute left-1/2 -translate-x-1/2 border-4 border-transparent ${caretClassName}`}
            />
          </div>
        </Transition>
      </Portal>
    </>
  )
}

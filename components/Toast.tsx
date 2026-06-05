'use client'

import { Transition } from '@headlessui/react'
import { X } from 'lucide-react'
import {
  Fragment,
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'

type ToastType = 'success' | 'error' | 'warning' | 'info'

interface Toast {
  id: string
  message: string
  type: ToastType
  duration: number
}

interface ToastContextValue {
  success: (message: string, duration?: number) => void
  error: (message: string, duration?: number) => void
  warning: (message: string, duration?: number) => void
  info: (message: string, duration?: number) => void
}

const TOAST_DEDUPE_WINDOW_MS = 3200

const ToastContext = createContext<ToastContextValue | null>(null)

export function useToast() {
  const context = useContext(ToastContext)
  if (!context) {
    throw new Error('useToast must be used within ToastProvider')
  }
  return context
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([])
  const dedupeRef = useRef<Map<string, number>>(new Map())

  const removeToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((toast) => toast.id !== id))
  }, [])

  const addToast = useCallback((message: string, type: ToastType, duration = 3000) => {
    const normalizedMessage = message.trim()
    if (!normalizedMessage) return

    const dedupeKey = `${type}:${normalizedMessage}`
    const now = Date.now()
    const lastShownAt = dedupeRef.current.get(dedupeKey)

    if (lastShownAt && now - lastShownAt < TOAST_DEDUPE_WINDOW_MS) {
      return
    }

    dedupeRef.current.set(dedupeKey, now)

    const id = `${now}-${Math.random().toString(36).slice(2, 8)}`
    const toast: Toast = { id, message: normalizedMessage, type, duration }

    setToasts((prev) => [...prev, toast].slice(-4))
  }, [])

  useEffect(() => {
    if (toasts.length === 0) return

    const timers = toasts
      .filter((toast) => toast.duration > 0)
      .map((toast) => window.setTimeout(() => removeToast(toast.id), toast.duration))

    return () => {
      timers.forEach((timer) => window.clearTimeout(timer))
    }
  }, [removeToast, toasts])

  useEffect(() => {
    const id = window.setInterval(() => {
      const now = Date.now()
      for (const [key, ts] of dedupeRef.current.entries()) {
        if (now - ts > TOAST_DEDUPE_WINDOW_MS * 2) {
          dedupeRef.current.delete(key)
        }
      }
    }, TOAST_DEDUPE_WINDOW_MS)

    return () => window.clearInterval(id)
  }, [])

  const value = useMemo<ToastContextValue>(() => ({
    success: (message, duration) => addToast(message, 'success', duration),
    error: (message, duration) => addToast(message, 'error', duration),
    warning: (message, duration) => addToast(message, 'warning', duration),
    info: (message, duration) => addToast(message, 'info', duration),
  }), [addToast])

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="pointer-events-none fixed inset-x-0 top-3 z-[120] flex justify-center px-4 sm:top-4">
        <div className="flex w-full flex-col items-center gap-2">
          {toasts.map((toast) => (
            <ToastItem
              key={toast.id}
              toast={toast}
              onClose={() => removeToast(toast.id)}
            />
          ))}
        </div>
      </div>
    </ToastContext.Provider>
  )
}

function ToastItem({ toast, onClose }: { toast: Toast; onClose: () => void }) {
  const toneStyles = {
    success: {
      dot: 'var(--ui-success)',
      text: 'var(--ui-ink)',
    },
    error: {
      dot: 'var(--ui-danger)',
      text: 'var(--ui-ink)',
    },
    warning: {
      dot: 'var(--ui-warning)',
      text: 'var(--ui-ink)',
    },
    info: {
      dot: 'var(--ui-info)',
      text: 'var(--ui-ink)',
    },
  }[toast.type]

  return (
    <Transition
      appear
      as={Fragment}
      show
      enter="transform transition duration-200 ease-out"
      enterFrom="-translate-y-2 opacity-0"
      enterTo="translate-y-0 opacity-100"
      leave="transform transition duration-150 ease-in"
      leaveFrom="translate-y-0 opacity-100"
      leaveTo="-translate-y-1 opacity-0"
    >
      <div
        className="pointer-events-auto flex w-fit min-w-[18rem] max-w-[26rem] items-start gap-3 rounded-[1.15rem] border px-4 py-3 shadow-[0_10px_30px_rgb(var(--ui-shadow-rgb)/0.08)] backdrop-blur-xl"
        style={{
          background: 'color-mix(in srgb, var(--ui-panel) 90%, transparent)',
          borderColor: 'color-mix(in srgb, var(--ui-line) 78%, transparent)',
          color: toneStyles.text,
        }}
        role="status"
        aria-live="polite"
      >
        <span
          className="mt-[0.45rem] h-2 w-2 shrink-0 rounded-full"
          style={{ background: toneStyles.dot }}
          aria-hidden="true"
        />
        <p className="min-w-0 flex-1 text-[13px] leading-6 sm:text-sm">{toast.message}</p>
        <button
          type="button"
          onClick={onClose}
          className="rounded-full p-1 text-[var(--ui-muted)] transition hover:bg-[color-mix(in_srgb,var(--ui-line)_44%,transparent)] hover:text-[var(--ui-ink)]"
          aria-label="关闭提示"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </Transition>
  )
}

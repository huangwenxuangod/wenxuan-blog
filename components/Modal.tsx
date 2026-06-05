'use client'

import { Dialog, DialogBackdrop, DialogPanel, DialogTitle } from '@headlessui/react'
import { X } from 'lucide-react'
import { useEffect, useState } from 'react'
import { cx } from '@/components/ui/primitives'

interface ModalProps {
  isOpen: boolean
  onClose: () => void
  onConfirm?: () => void | boolean | Promise<void | boolean>
  title: string
  description?: string
  confirmText?: string
  cancelText?: string
  type?: 'danger' | 'warning' | 'info'
  closeOnConfirm?: boolean
}

export function Modal({
  isOpen,
  onClose,
  onConfirm,
  title,
  description,
  confirmText = '确认',
  cancelText = '取消',
  type = 'info',
  closeOnConfirm = true,
}: ModalProps) {
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    if (!isOpen) setSubmitting(false)
  }, [isOpen])

  const confirmTone = {
    danger: 'bg-rose-500 text-white hover:bg-rose-600',
    warning: 'bg-amber-500 text-white hover:bg-amber-600',
    info: 'bg-[var(--editor-accent)] text-[var(--editor-accent-ink)] hover:brightness-105',
  }[type]

  const handleConfirm = async () => {
    if (!onConfirm || submitting) return
    setSubmitting(true)
    try {
      const result = await onConfirm()
      if (result !== false && closeOnConfirm) {
        onClose()
      }
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog open={isOpen} onClose={submitting ? () => {} : onClose} className="relative z-50">
      <DialogBackdrop className="fixed inset-0 bg-black/45 transition duration-200 data-[closed]:opacity-0" />

      <div className="fixed inset-0 flex items-center justify-center p-4">
        <DialogPanel className="ui-modal-panel w-full max-w-md rounded-2xl transition duration-200 data-[closed]:scale-95 data-[closed]:opacity-0">
          <div className="flex items-start justify-between gap-4 px-6 pb-4 pt-6">
            <DialogTitle as="h3" className="text-lg font-semibold text-[var(--editor-ink)]">
              {title}
            </DialogTitle>
            <button
              type="button"
              onClick={onClose}
              disabled={submitting}
              className="editor-quiet-icon-button h-8 w-8 shrink-0 disabled:cursor-not-allowed disabled:opacity-40"
              aria-label="关闭"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          {description ? (
            <div className="px-6 pb-6">
              <p className="text-sm leading-7 text-[var(--editor-muted)]">{description}</p>
            </div>
          ) : null}

          <div className="flex items-center justify-end gap-3 px-6 pb-6">
            <button
              type="button"
              onClick={onClose}
              disabled={submitting}
              className="text-sm text-[var(--editor-muted)] transition hover:text-[var(--editor-ink)] disabled:cursor-not-allowed disabled:opacity-40"
            >
              {cancelText}
            </button>
            {onConfirm ? (
              <button
                type="button"
                onClick={handleConfirm}
                disabled={submitting}
                className={cx(
                  'rounded-xl px-4 py-2 text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-40',
                  confirmTone,
                )}
              >
                {submitting ? '处理中…' : confirmText}
              </button>
            ) : null}
          </div>
        </DialogPanel>
      </div>
    </Dialog>
  )
}

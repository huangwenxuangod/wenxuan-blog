'use client'

import { useMemo, useState } from 'react'
import { EyeOff, FolderInput, LockOpen, Pin, RotateCcw, Trash2, Upload } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { Dropdown } from '@/components/Dropdown'
import { useToast } from '@/components/Toast'

interface BulkActionsBarProps {
  selectedCount: number
  categories: string[]
  selectedSlugs: string[]
  onClearSelection: () => void
  allowRestore?: boolean
}

type BulkAction =
  | { type: 'set-category'; value: string }
  | { type: 'set-status'; value: 'draft' | 'published' }
  | { type: 'set-pinned'; value: 0 | 1 }
  | { type: 'set-hidden'; value: 0 | 1 }
  | { type: 'delete' }
  | { type: 'restore' }
  | { type: 'clear-password' }

export function BulkActionsBar({
  selectedCount,
  categories,
  selectedSlugs,
  onClearSelection,
  allowRestore = false,
}: BulkActionsBarProps) {
  const router = useRouter()
  const toast = useToast()
  const [loading, setLoading] = useState(false)
  const [categoryValue, setCategoryValue] = useState('')

  const categoryOptions = useMemo(() => [
    { value: '', label: '选择分类' },
    { value: 'AI', label: 'AI' },
    ...categories.map((cat) => ({ value: cat, label: cat })),
  ], [categories])

  const runAction = async (action: BulkAction) => {
    if (selectedSlugs.length === 0) {
      toast.warning('请先选择文章')
      return
    }

    setLoading(true)
    try {
      const res = await fetch('/api/admin/posts/bulk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          slugs: selectedSlugs,
          action: action.type,
          value: 'value' in action ? action.value : undefined,
        }),
      })

      const data = await res.json().catch(() => ({})) as { success?: boolean; affected?: number; error?: string }
      if (!res.ok || !data.success) {
        throw new Error(data.error || '批量操作失败')
      }

      const affected = data.affected ?? selectedSlugs.length
      const labelMap: Record<string, string> = {
        'set-category': '分类已更新',
        'set-status': action.type === 'set-status' && action.value === 'published' ? '已批量发布' : '已批量转为草稿',
        'set-pinned': action.type === 'set-pinned' && action.value === 1 ? '已批量置顶' : '已批量取消置顶',
        'set-hidden': action.type === 'set-hidden' && action.value === 1 ? '已批量隐藏' : '已批量取消隐藏',
        delete: '已批量删除',
        restore: '已批量恢复',
        'clear-password': '已批量清除密码',
      }

      toast.success(`${labelMap[action.type]} · ${affected} 篇`)
      onClearSelection()
      setCategoryValue('')
      router.refresh()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '批量操作失败')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="mb-4 rounded-xl border border-[var(--editor-line)] bg-[color-mix(in_srgb,var(--editor-panel)_88%,transparent)] px-4 py-3 shadow-[0_10px_24px_rgba(0,0,0,0.04)] backdrop-blur-sm">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex items-center gap-3 text-sm">
          <span className="inline-flex h-8 items-center rounded-full bg-[color-mix(in_srgb,var(--editor-selection)_72%,transparent)] px-3 font-medium text-[var(--editor-ink)]">
            已选 {selectedCount} 篇
          </span>
          <button
            type="button"
            onClick={onClearSelection}
            className="text-[var(--editor-muted)] transition hover:text-[var(--editor-ink)]"
          >
            清空选择
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="min-w-[150px]">
            <Dropdown
              options={categoryOptions}
              value={categoryValue}
              onChange={(next) => {
                setCategoryValue(next)
                if (next) void runAction({ type: 'set-category', value: next })
              }}
              placeholder="批量改分类"
              className="w-full"
              disabled={loading}
            />
          </div>

          <button type="button" onClick={() => void runAction({ type: 'set-status', value: 'published' })} disabled={loading} className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--editor-line)] px-3 py-2 text-sm text-[var(--editor-ink)] transition hover:bg-[var(--editor-soft)] disabled:opacity-50">
            <Upload className="h-4 w-4" />
            发布
          </button>
          <button type="button" onClick={() => void runAction({ type: 'set-status', value: 'draft' })} disabled={loading} className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--editor-line)] px-3 py-2 text-sm text-[var(--editor-ink)] transition hover:bg-[var(--editor-soft)] disabled:opacity-50">
            <FolderInput className="h-4 w-4" />
            草稿
          </button>
          <button type="button" onClick={() => void runAction({ type: 'set-pinned', value: 1 })} disabled={loading} className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--editor-line)] px-3 py-2 text-sm text-[var(--editor-ink)] transition hover:bg-[var(--editor-soft)] disabled:opacity-50">
            <Pin className="h-4 w-4" />
            置顶
          </button>
          <button type="button" onClick={() => void runAction({ type: 'set-hidden', value: 1 })} disabled={loading} className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--editor-line)] px-3 py-2 text-sm text-[var(--editor-ink)] transition hover:bg-[var(--editor-soft)] disabled:opacity-50">
            <EyeOff className="h-4 w-4" />
            隐藏
          </button>
          <button type="button" onClick={() => void runAction({ type: 'clear-password' })} disabled={loading} className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--editor-line)] px-3 py-2 text-sm text-[var(--editor-ink)] transition hover:bg-[var(--editor-soft)] disabled:opacity-50">
            <LockOpen className="h-4 w-4" />
            清密码
          </button>

          {allowRestore ? (
            <button type="button" onClick={() => void runAction({ type: 'restore' })} disabled={loading} className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--editor-line)] px-3 py-2 text-sm text-[var(--editor-ink)] transition hover:bg-[var(--editor-soft)] disabled:opacity-50">
              <RotateCcw className="h-4 w-4" />
              恢复
            </button>
          ) : null}

          <button type="button" onClick={() => void runAction({ type: 'delete' })} disabled={loading} className="inline-flex items-center gap-1.5 rounded-lg border border-rose-200 px-3 py-2 text-sm text-rose-600 transition hover:bg-rose-50 disabled:opacity-50">
            <Trash2 className="h-4 w-4" />
            删除
          </button>
        </div>
      </div>
    </div>
  )
}

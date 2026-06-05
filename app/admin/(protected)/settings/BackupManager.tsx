'use client'

import { useState } from 'react'
import { Tooltip } from '@/components/ui/Tooltip'
import { FileDown, Archive, Database, Table, Check, AlertCircle } from 'lucide-react'

interface PostRow {
  id: number
  slug: string
  title: string
  content: string
  html: string
  description: string | null
  category: string
  tags: string | null // JSON string or comma-separated
  status: string
  password?: string | null
  is_pinned: number
  is_hidden: number
  cover_image: string | null
  published_at: number
  updated_at: number
  view_count: number
  deleted_at?: number | null
}

interface CategoryRow {
  id: number
  name: string
  slug: string
  post_count: number
}

interface SettingRow {
  key: string;
  value: string;
}

interface BackupData {
  posts: PostRow[]
  categories: CategoryRow[]
  settings: SettingRow[]
}

export function BackupManager() {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [successMsg, setSuccessMsg] = useState<string | null>(null)

  const fetchBackupData = async (): Promise<BackupData> => {
    const res = await fetch('/api/admin/backup')
    if (!res.ok) {
      const { parseApiError } = await import('@/lib/api-client')
      const apiError = await parseApiError(res)
      let errMsg = apiError.message
      if (apiError.requestId && apiError.requestId !== 'unknown') {
        errMsg += ` [ID: ${apiError.requestId.slice(0, 8)}]`
      }
      if (apiError.hint) {
        errMsg += ` (${apiError.hint})`
      }
      throw new Error(errMsg)
    }
    return await res.json() as BackupData
  };

  const showSuccess = (msg: string) => {
    setSuccessMsg(msg)
    setTimeout(() => setSuccessMsg(null), 4000)
  }

  const exportMarkdownZip = async () => {
    setLoading(true)
    setError(null)
    try {
      const data = await fetchBackupData()
      const { zipSync, strToU8 } = await import('fflate')

      const zipFiles: Record<string, Uint8Array> = {}

      data.posts.forEach((post) => {
        // Format tags safely
        let tagsArr: string[] = []
        if (post.tags) {
          try {
            tagsArr = JSON.parse(post.tags)
          } catch {
            tagsArr = post.tags.split(',').map((t) => t.trim()).filter(Boolean)
          }
        }

        // Format dates safely
        const pubDate = new Date(post.published_at * 1000).toISOString()
        const updDate = new Date(post.updated_at * 1000).toISOString()

        // Create YAML Front Matter
        const frontMatter = [
          '---',
          `title: ${JSON.stringify(post.title)}`,
          `slug: ${post.slug}`,
          `date: ${pubDate}`,
          `updated: ${updDate}`,
          `category: ${JSON.stringify(post.category)}`,
          `tags: ${JSON.stringify(tagsArr)}`,
          `status: ${post.status}`,
          `is_pinned: ${post.is_pinned === 1}`,
          `is_hidden: ${post.is_hidden === 1}`,
          post.cover_image ? `cover_image: ${JSON.stringify(post.cover_image)}` : null,
          post.description ? `description: ${JSON.stringify(post.description)}` : null,
          '---',
          '',
          post.content || '',
        ].filter((line) => line !== null).join('\n')

        // Keep filenames human-readable while making collisions effectively impossible.
        const safeTitle = post.title.replace(/[/\\?%*:|"<>\s]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '').slice(0, 50)
        const safeSlug = post.slug.replace(/[/\\?%*:|"<>\s]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '')
        const fileBase = safeTitle ? `${safeTitle}__${safeSlug}` : safeSlug || `post-${post.id}`
        zipFiles[`posts/${fileBase}.md`] = strToU8(frontMatter)
      })

      // Include metadata manifest
      const manifest = {
        exported_at: new Date().toISOString(),
        total_posts: data.posts.length,
        categories: data.categories.map(c => ({ name: c.name, slug: c.slug })),
      }
      zipFiles['manifest.json'] = strToU8(JSON.stringify(manifest, null, 2))

      const zipped = zipSync(zipFiles)
      const blob = await new Response(new Uint8Array(zipped), {
        headers: { 'Content-Type': 'application/zip' },
      }).blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `wenxuan-markdown-backup-${new Date().toISOString().slice(0, 10)}.zip`
      a.click()
      URL.revokeObjectURL(url)

      showSuccess(`成功导出 ${data.posts.length} 篇 Markdown 文章！`)
    } catch (err) {
      setError(err instanceof Error ? err.message : '导出 Markdown ZIP 失败')
    } finally {
      setLoading(false)
    }
  }

  const exportJsonBackup = async () => {
    setLoading(true)
    setError(null)
    try {
      const data = await fetchBackupData()
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `wenxuan-database-backup-${new Date().toISOString().slice(0, 10)}.json`
      a.click()
      URL.revokeObjectURL(url)

      showSuccess('成功导出全站 JSON 数据库备份！')
    } catch (err) {
      setError(err instanceof Error ? err.message : '导出 JSON 失败')
    } finally {
      setLoading(false)
    }
  }

  const exportCsvTable = async () => {
    setLoading(true)
    setError(null)
    try {
      const data = await fetchBackupData()

      const headers = ['ID', 'Slug', 'Title', 'Category', 'Tags', 'Status', 'Views', 'Published At', 'Updated At', 'Is Pinned', 'Is Hidden']
      const rows = data.posts.map((post) => {
        let tagsStr = ''
        if (post.tags) {
          try {
            tagsStr = JSON.parse(post.tags).join('; ')
          } catch {
            tagsStr = post.tags
          }
        }
        const pubDate = new Date(post.published_at * 1000).toISOString().slice(0, 19).replace('T', ' ')
        const updDate = new Date(post.updated_at * 1000).toISOString().slice(0, 19).replace('T', ' ')

        return [
          post.id,
          post.slug,
          post.title,
          post.category,
          tagsStr,
          post.status,
          post.view_count,
          pubDate,
          updDate,
          post.is_pinned === 1 ? 'Yes' : 'No',
          post.is_hidden === 1 ? 'Yes' : 'No'
        ]
      })

      // Helper to escape CSV cell values
      const escapeCsvCell = (val: unknown) => {
        if (val === null || val === undefined) return ''
        const str = String(val)
        if (str.includes(',') || str.includes('"') || str.includes('\n')) {
          return `"${str.replace(/"/g, '""')}"`
        }
        return str
      }

      const csvContent = [
        headers.join(','),
        ...rows.map(row => row.map(escapeCsvCell).join(','))
      ].join('\n')

      const blob = new Blob([new Uint8Array([0xEF, 0xBB, 0xBF]), csvContent], { type: 'text/csv;charset=utf-8' }) // Add BOM for Excel Chinese support
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `wenxuan-posts-${new Date().toISOString().slice(0, 10)}.csv`
      a.click()
      URL.revokeObjectURL(url)

      showSuccess('成功导出文章列表 CSV 数据表！')
    } catch (err) {
      setError(err instanceof Error ? err.message : '导出 CSV 失败')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="space-y-6">
      {/* Toast Messages */}
      {successMsg && (
        <div className="flex items-center gap-2 rounded-lg border border-[color-mix(in_srgb,var(--ui-success)_32%,transparent)] bg-[color-mix(in_srgb,var(--ui-success)_12%,var(--ui-surface))] px-4 py-3 text-sm text-[var(--ui-success)] transition-all">
          <Check className="h-4 w-4 shrink-0" />
          <span>{successMsg}</span>
        </div>
      )}

      {error && (
        <div className="flex items-center gap-2 rounded-lg border border-[color-mix(in_srgb,var(--ui-danger)_32%,transparent)] bg-[color-mix(in_srgb,var(--ui-danger)_12%,var(--ui-surface))] px-4 py-3 text-sm text-[var(--ui-danger)] transition-all">
          <AlertCircle className="h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      <div className="rounded-xl border border-[var(--ui-border)] bg-[var(--ui-surface-hover)] p-5">
        <h3 className="text-base font-medium text-[var(--ui-text)]">数据归属权与备份</h3>
        <p className="mt-1.5 text-sm text-[var(--editor-muted)] leading-relaxed">
          “文轩”践行 100% 数据所有权理念。您可以随时随地一键导出全站的所有文章、分类和系统设置，没有任何平台绑定或格式限制。
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Card 1: Markdown ZIP */}
        <div className="flex flex-col justify-between rounded-xl border border-[var(--ui-border)] bg-[var(--ui-surface)] p-5 transition-shadow hover:shadow-sm">
          <div>
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-[var(--ui-accent)]/8 text-[var(--ui-accent)]">
              <Archive className="h-5 w-5" />
            </div>
            <h4 className="mt-4 text-sm font-medium text-[var(--ui-text)]">Markdown (ZIP)</h4>
            <p className="mt-2 text-xs text-[var(--editor-muted)] leading-relaxed">
              将所有文章导出为独立的 Markdown 文件，带有完整的 YAML 元数据（Front Matter），完美兼容 Obsidian、Hugo 等工具。
            </p>
          </div>
          <div className="mt-5">
            <Tooltip content="打包并下载所有文章的 Markdown 文件">
              <button
                type="button"
                onClick={exportMarkdownZip}
                disabled={loading}
                className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-[var(--ui-accent)] px-3 py-2 text-xs font-medium text-[var(--ui-accent-ink)] hover:brightness-[1.02] transition disabled:opacity-70"
              >
                <FileDown className="h-3.5 w-3.5" />
                {loading ? '正在处理...' : '打包导出 Markdown'}
              </button>
            </Tooltip>
          </div>
        </div>

        {/* Card 2: JSON Backup */}
        <div className="flex flex-col justify-between rounded-xl border border-[var(--ui-border)] bg-[var(--ui-surface)] p-5 transition-shadow hover:shadow-sm">
          <div>
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-[var(--ui-success)]/8 text-[var(--ui-success)]">
              <Database className="h-5 w-5" />
            </div>
            <h4 className="mt-4 text-sm font-medium text-[var(--ui-text)]">JSON 数据库备份</h4>
            <p className="mt-2 text-xs text-[var(--editor-muted)] leading-relaxed">
              包含文章表、分类表和站点设置的完整数据库结构。可用于更换博客主机、迁移服务器或全站数据恢复。
            </p>
          </div>
          <div className="mt-5">
            <Tooltip content="下载全站数据库的完整 JSON 快照">
              <button
                type="button"
                onClick={exportJsonBackup}
                disabled={loading}
                className="inline-flex w-full items-center justify-center gap-2 rounded-lg border border-[var(--ui-border)] bg-[var(--ui-surface)] px-3 py-2 text-xs font-medium text-[var(--ui-text)] hover:bg-[var(--ui-surface-hover)] transition disabled:opacity-70"
              >
                <FileDown className="h-3.5 w-3.5" />
                {loading ? '正在处理...' : '导出 JSON 备份'}
              </button>
            </Tooltip>
          </div>
        </div>

        {/* Card 3: CSV Spreadsheet */}
        <div className="flex flex-col justify-between rounded-xl border border-[var(--ui-border)] bg-[var(--ui-surface)] p-5 transition-shadow hover:shadow-sm">
          <div>
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-amber-500/8 text-amber-600">
              <Table className="h-5 w-5" />
            </div>
            <h4 className="mt-4 text-sm font-medium text-[var(--ui-text)]">CSV 数据表</h4>
            <p className="mt-2 text-xs text-[var(--editor-muted)] leading-relaxed">
              将文章列表属性（包含标题、分类、发布时间、阅读量等）导出为标准 CSV 表格，可直接在 Excel 或 Numbers 中打开分析。
            </p>
          </div>
          <div className="mt-5">
            <Tooltip content="下载文章属性列表 CSV 报表">
              <button
                type="button"
                onClick={exportCsvTable}
                disabled={loading}
                className="inline-flex w-full items-center justify-center gap-2 rounded-lg border border-[var(--ui-border)] bg-[var(--ui-surface)] px-3 py-2 text-xs font-medium text-[var(--ui-text)] hover:bg-[var(--ui-surface-hover)] transition disabled:opacity-70"
              >
                <FileDown className="h-3.5 w-3.5" />
                {loading ? '正在处理...' : '导出 CSV 表格'}
              </button>
            </Tooltip>
          </div>
        </div>
      </div>
    </div>
  )
}

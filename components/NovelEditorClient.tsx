'use client'

import dynamic from 'next/dynamic'
import { BackofficeThemeScope } from '@/components/BackofficeThemeScope'

const NovelEditor = dynamic(
  () => import('@/components/NovelEditor').then((module) => ({ default: module.NovelEditor })),
  {
    ssr: false,
    loading: () => (
      <div className="backoffice-shell editor-shell flex h-screen items-center justify-center bg-[var(--ui-bg)]">
        <div className="text-sm text-[var(--editor-muted)]">加载编辑器...</div>
      </div>
    ),
  },
)

export function NovelEditorClient(props: {
  initialData?: {
    slug: string
    title: string
    html: string
    category?: string
    status?: 'draft' | 'published' | 'deleted'
    password?: string | null
    is_hidden?: number
    tags?: string[]
    description?: string | null
    cover_image?: string | null
  }
  skipDraftRestore?: boolean
  initialCategory?: string
}) {
  const editorInstanceKey = props.initialData?.slug || `new:${props.initialCategory || 'AI'}`

  return (
    <>
      <BackofficeThemeScope />
      <NovelEditor key={editorInstanceKey} {...props} />
    </>
  )
}

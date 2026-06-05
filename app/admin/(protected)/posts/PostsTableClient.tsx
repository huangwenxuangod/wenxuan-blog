'use client'

import { useEffect, useMemo, useState } from 'react'
import type { PostWithTags } from '@/lib/db'
import { BulkActionsBar } from './BulkActionsBar'
import { PostRow } from './PostRow'

interface PostsTableClientProps {
  posts: PostWithTags[]
  categories: string[]
  currentStatus?: string
}

export function PostsTableClient({
  posts,
  categories,
  currentStatus,
}: PostsTableClientProps) {
  const [selectedSlugs, setSelectedSlugs] = useState<string[]>([])
  const visibleSlugSet = useMemo(() => new Set(posts.map((post) => post.slug)), [posts])

  const selectedSet = useMemo(() => new Set(selectedSlugs), [selectedSlugs])
  const allVisibleSelected = posts.length > 0 && posts.every((post) => selectedSet.has(post.slug))
  const selectedCount = selectedSlugs.length

  useEffect(() => {
    setSelectedSlugs((current) => current.filter((slug) => visibleSlugSet.has(slug)))
  }, [visibleSlugSet])

  const toggleOne = (slug: string) => {
    setSelectedSlugs((current) =>
      current.includes(slug)
        ? current.filter((item) => item !== slug)
        : [...current, slug],
    )
  }

  const toggleAllVisible = () => {
    if (allVisibleSelected) {
      setSelectedSlugs([])
    } else {
      setSelectedSlugs(posts.map((post) => post.slug))
    }
  }

  return (
    <>
      {selectedCount > 0 ? (
        <BulkActionsBar
          selectedCount={selectedCount}
          categories={categories}
          selectedSlugs={selectedSlugs}
          onClearSelection={() => setSelectedSlugs([])}
          allowRestore={currentStatus === 'deleted'}
        />
      ) : null}

      <div className="bg-[var(--editor-panel)] rounded-xl border border-[var(--editor-line)] overflow-hidden">
        <div className="hidden md:grid grid-cols-[44px_56px_minmax(0,1fr)_200px_88px_116px_232px] gap-4 px-5 py-3.5 border-b border-[var(--editor-line)] bg-[var(--editor-soft)] items-center">
          <div className="flex items-center justify-center">
            <input
              type="checkbox"
              checked={allVisibleSelected}
              onChange={toggleAllVisible}
              aria-label="全选当前结果"
              className="h-4 w-4 cursor-pointer rounded border-[var(--editor-line)] text-[var(--editor-accent)] accent-[var(--editor-accent)]"
            />
          </div>
          <span className="text-center text-xs font-semibold uppercase tracking-wide text-[var(--editor-muted)]">
            状态
          </span>
          <span className="text-xs font-semibold uppercase tracking-wide text-[var(--editor-muted)]">
            标题
          </span>
          <span className="text-center text-xs font-semibold uppercase tracking-wide text-[var(--editor-muted)]">
            分类
          </span>
          <span className="text-center text-xs font-semibold uppercase tracking-wide text-[var(--editor-muted)]">
            阅读
          </span>
          <span className="text-center text-xs font-semibold uppercase tracking-wide text-[var(--editor-muted)]">
            时间
          </span>
          <span className="text-right text-xs font-semibold uppercase tracking-wide text-[var(--editor-muted)]">
            操作
          </span>
        </div>

        <div className="divide-y divide-[var(--editor-line)]">
          {posts.map((post) => (
            <PostRow
              key={post.slug}
              post={post}
              categories={categories}
              selectable
              selected={selectedSet.has(post.slug)}
              onToggleSelect={() => toggleOne(post.slug)}
            />
          ))}
        </div>
      </div>
    </>
  )
}

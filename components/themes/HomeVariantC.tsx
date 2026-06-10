'use client'

import Link from 'next/link'
import { SiteHeader } from '@/components/SiteHeader'
import { SiteFooter } from '@/components/SiteFooter'
import { Pagination } from '@/components/Pagination'
import type { HomeProps } from '@/components/HomeClient'

function formatDate(ts: number) {
  return new Date(ts * 1000).toLocaleDateString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  })
}

export function HomeVariantC({
  initialTheme,
  posts,
  categories,
  navLinks,
  currentPage,
  totalPages,
  categorySlugMap,
}: HomeProps) {
  return (
    <div className="theme-home-terminal min-h-full bg-[var(--background)] text-[var(--editor-ink)]">
      <SiteHeader
        initialTheme={initialTheme}
        navLinks={navLinks}
        categories={categories}
      />

      <main className="mx-auto flex w-full max-w-[1160px] flex-1 flex-col px-4 pb-24 pt-8 sm:px-6 sm:pt-10">
        {posts.length === 0 ? (
          <div className="flex flex-1 items-center justify-center py-24">
            <p className="text-[var(--editor-muted)]">还没有文章</p>
          </div>
        ) : (
          <section className="grid gap-5">
            {posts.map((post) => (
              <article
                key={post.slug}
                className="rounded-[1.8rem] border border-[var(--editor-line)] bg-[var(--editor-panel)] shadow-[0_14px_34px_rgb(0_0_0/0.035)] transition hover:-translate-y-[1px] hover:border-[var(--editor-line-strong)]"
              >
                <Link href={`/${post.slug}`} className="grid gap-5 px-5 py-5 sm:grid-cols-[10rem_minmax(0,1fr)] sm:px-7 sm:py-6">
                  <div className="flex flex-col gap-3 text-sm text-[var(--editor-muted)]">
                    <time className="font-medium tracking-[0.04em]">{formatDate(post.published_at)}</time>
                    <div className="flex flex-wrap gap-2">
                      {post.category ? (
                        (() => {
                          const slug = categorySlugMap[post.category]
                          const categoryNode = (
                            <span className="inline-flex rounded-full border border-[var(--editor-line)] bg-[var(--background)] px-2.5 py-1 text-xs text-[var(--editor-muted)]">
                              {post.category}
                            </span>
                          )

                          return slug ? (
                            <Link href={`/category/${slug}`} className="contents">
                              {categoryNode}
                            </Link>
                          ) : categoryNode
                        })()
                      ) : null}
                      {post.is_pinned === 1 ? (
                        <span className="inline-flex rounded-full border border-[color-mix(in_srgb,var(--editor-accent)_28%,var(--editor-line))] bg-[color-mix(in_srgb,var(--editor-accent)_8%,transparent)] px-2.5 py-1 text-xs text-[var(--editor-accent)]">
                          置顶
                        </span>
                      ) : null}
                    </div>
                  </div>

                  <div className="min-w-0">
                    <h2
                      className="text-[1.35rem] font-semibold leading-[1.35] tracking-[-0.02em] text-[var(--editor-ink)] sm:text-[1.7rem]"
                      style={{ fontFamily: 'var(--logo-font, "Noto Serif SC", Georgia, serif)' }}
                    >
                      {post.title}
                    </h2>
                    {post.description ? (
                      <p className="mt-3 line-clamp-2 text-[15px] leading-7 text-[var(--editor-muted)]">
                        {post.description}
                      </p>
                    ) : null}
                    <div className="mt-4 flex items-center gap-3 text-sm text-[var(--editor-muted)]">
                      <span className="inline-flex items-center gap-2">
                        <span className="h-1 w-1 rounded-full bg-[var(--editor-muted)]" />
                        阅读全文
                      </span>
                      {post.password ? (
                        <span className="inline-flex items-center gap-2">
                          <span className="h-1 w-1 rounded-full bg-[var(--editor-muted)]" />
                          已加密
                        </span>
                      ) : null}
                    </div>
                  </div>
                </Link>
              </article>
            ))}
          </section>
        )}

        <div className="pt-8">
          <Pagination currentPage={currentPage} totalPages={totalPages} basePath="/" />
        </div>
      </main>

      <SiteFooter />
    </div>
  )
}

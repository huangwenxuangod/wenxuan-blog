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

function buildStats(posts: HomeProps['posts']) {
  const categories = new Set(posts.map((post) => post.category).filter(Boolean))
  const pinnedCount = posts.filter((post) => post.is_pinned === 1).length

  return [
    { label: '文章', value: String(posts.length) },
    { label: '分类', value: String(categories.size) },
    { label: '置顶', value: String(pinnedCount) },
  ]
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
  const stats = buildStats(posts)

  return (
    <div className="theme-home-terminal min-h-full bg-[var(--background)] text-[var(--editor-ink)]">
      <SiteHeader
        initialTheme={initialTheme}
        navLinks={navLinks}
        categories={categories}
      />

      <main className="mx-auto flex w-full max-w-[1160px] flex-1 flex-col px-4 pb-24 pt-8 sm:px-6 sm:pt-10">
        <section className="rounded-[2rem] border border-[var(--editor-line)] bg-[var(--editor-panel)] px-5 py-6 shadow-[0_18px_40px_rgb(0_0_0/0.04)] sm:px-8 sm:py-8">
          <div className="grid gap-8 lg:grid-cols-[minmax(0,1.3fr)_22rem]">
            <div className="min-w-0">
              <div className="mb-3 inline-flex items-center rounded-full border border-[var(--editor-line)] bg-[var(--background)] px-3 py-1 text-[11px] font-medium tracking-[0.16em] text-[var(--editor-muted)]">
                BACKOFFICE LIGHT
              </div>
              <h1
                className="max-w-3xl text-[2rem] font-semibold leading-[1.15] tracking-[-0.04em] text-[var(--editor-ink)] sm:text-[3.15rem]"
                style={{ fontFamily: 'var(--logo-font, "Noto Serif SC", Georgia, serif)' }}
              >
                和后台亮色同一套语义的前台首页。
              </h1>
              <p className="mt-4 max-w-2xl text-[15px] leading-8 text-[var(--editor-muted)] sm:text-[16px]">
                不再是终端感的演示皮肤，而是一套更克制、安静、可长期使用的公开站点主题。
              </p>
            </div>

            <div className="grid grid-cols-3 gap-3 self-start">
              {stats.map((item) => (
                <div
                  key={item.label}
                  className="rounded-[1.35rem] border border-[var(--editor-line)] bg-[var(--background)] px-4 py-4"
                >
                  <div className="text-[11px] tracking-[0.12em] text-[var(--editor-muted)]">{item.label}</div>
                  <div className="mt-2 text-[1.45rem] font-semibold leading-none text-[var(--editor-ink)]">
                    {item.value}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {posts.length === 0 ? (
          <div className="flex flex-1 items-center justify-center py-24">
            <div className="rounded-[1.8rem] border border-[var(--editor-line)] bg-[var(--editor-panel)] px-8 py-12 text-center">
              <p className="text-[var(--editor-muted)]">还没有文章</p>
              <Link
                href="/editor"
                className="mt-4 inline-flex rounded-full border border-[var(--editor-line)] bg-[var(--background)] px-4 py-2 text-sm text-[var(--editor-ink)] transition hover:border-[var(--editor-line-strong)] hover:text-[var(--editor-accent)]"
              >
                开始写作
              </Link>
            </div>
          </div>
        ) : (
          <section className="mt-8 grid gap-5">
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

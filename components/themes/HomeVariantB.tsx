'use client'

// Variant B: 杂志编辑风 — Editorial Magazine
// Giant serif masthead, featured headline, numbered article grid

import { useState } from 'react'
import Link from 'next/link'
import { SiteFooter } from '@/components/SiteFooter'
import { SearchEntry } from '@/components/SearchEntry'
import { Pagination } from '@/components/Pagination'
import { ThemeDropdown } from '@/components/ThemeDropdown'
import type { HomeProps } from '@/components/HomeClient'
import type { SiteNavLink } from '@/lib/site'

const GithubIcon = ({ className = "w-4 h-4" }: { className?: string }) => (
  <svg
    viewBox="0 0 24 24"
    fill="currentColor"
    className={className}
    aria-hidden="true"
  >
    <path d="M12 2C6.477 2 2 7.477 2 13c0 4.42 2.865 8.166 6.839 9.489.5.092.682-.217.682-.482 0-.237-.008-.866-.013-1.7-2.782.603-3.369-1.34-3.369-1.34-.454-1.156-1.11-1.464-1.11-1.464-.908-.757.069-.742.069-.742 1.003.07 1.531 1.03 1.531 1.03.892 1.529 2.63 1.087 3.27.831.092-.646.4-1.088.736-1.338-2.22-.253-4.555-1.11-4.555-4.943 0-1.091.39-1.984 1.029-2.683-.103-.253-.446-1.27.098-2.647 0 0 .84-.269 2.75 1.025A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.294 2.747-1.025 2.747-1.025.546 1.377.203 2.394.1 2.647.64.699 1.028 1.592 1.028 2.683 0 3.842-2.339 4.687-4.566 4.935.359.309.678.919.678 1.852 0 1.336-.012 2.415-.012 2.743 0 .267.18.579.688.481C19.137 21.164 22 17.418 22 13c0-5.523-4.477-11-10-11z" />
  </svg>
)

const XIcon = ({ className = "w-4 h-4" }: { className?: string }) => (
  <svg
    viewBox="0 0 24 24"
    fill="currentColor"
    className={className}
    aria-hidden="true"
  >
    <path d="M18.244 2.25h3.308l-7.227 7.75 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.285L1.254 2.25h6.834l4.66 6.17zM17.08 19.75h1.833L7.084 4.126H5.117z" />
  </svg>
)

const getSocialIcon = (label: string, url: string, className = "w-4 h-4") => {
  const labelLower = label.toLowerCase()
  const urlLower = url.toLowerCase()

  if (labelLower.includes('github') || urlLower.includes('github.com')) {
    return <GithubIcon className={className} />
  }
  if (
    labelLower.includes('twitter') ||
    labelLower === 'x' ||
    labelLower.includes('x.com') ||
    labelLower.includes('~/twitter') ||
    urlLower.includes('twitter.com') ||
    urlLower.includes('x.com')
  ) {
    return <XIcon className={className} />
  }
  return null
}

const ACCENT = '#c44a2a' // editorial red-orange
const BG = '#f6f3ed'
const FG = '#1a1614'
const MUTED = '#7a6f68'
const BORDER = '#d8d2c8'

function formatDate(ts: number) {
  return new Date(ts * 1000).toLocaleDateString('zh-CN', { year: 'numeric', month: 'long', day: 'numeric' })
}

function getIssueInfo() {
  const now = new Date()
  const month = now.getMonth() + 1
  const year = now.getFullYear()
  const vol = year - 2023
  return { vol, month, year }
}

function EditorialNavBar({
  initialTheme,
  navLinks,
}: {
  initialTheme: HomeProps['initialTheme']
  navLinks: SiteNavLink[]
}) {
  const defaultLinks = [
    { label: 'GitHub', url: 'https://github.com/huangwenxuangod', openInNewTab: true },
    { label: 'Twitter', url: 'https://x.com/hungxun254458', openInNewTab: true },
    { label: 'RSS', url: '/feed.xml', openInNewTab: false },
  ]
  const links = navLinks.length > 0 ? navLinks : defaultLinks
  const { vol, month, year } = getIssueInfo()

  return (
    <div className="editorial-nav-bar" style={{
      borderBottom: `2px solid ${FG}`,
      padding: '14px 48px',
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
    }}>
      <div style={{
        fontSize: 11,
        letterSpacing: '0.2em',
        color: MUTED,
        fontFamily: '"JetBrains Mono", ui-monospace, monospace',
        textTransform: 'uppercase',
      }}>
        VOL. {vol} · {year}年{month}月
      </div>
      <nav className="editorial-nav-links" style={{ display: 'flex', gap: 20, alignItems: 'center', fontSize: 12, letterSpacing: '0.08em', fontFamily: '"JetBrains Mono", ui-monospace, monospace' }}>
        <Link href="/" style={{ color: FG, textDecoration: 'none' }}>首页</Link>
        {links.map(link => {
          const content = getSocialIcon(link.label, link.url) || link.label

          return link.url.startsWith('http') ? (
            <a
              key={link.label}
              href={link.url}
              target={link.openInNewTab ? '_blank' : undefined}
              rel={link.openInNewTab ? 'noopener noreferrer' : undefined}
              style={{ color: FG, textDecoration: 'none', display: 'inline-flex', alignItems: 'center' }}
            >
              {content}
            </a>
          ) : (
            <Link key={link.label} href={link.url} style={{ color: FG, textDecoration: 'none', display: 'inline-flex', alignItems: 'center' }}>
              {content}
            </Link>
          )
        })}
        {/* Theme dropdown — editorial style, self-contained */}
        <ThemeDropdown
          initialTheme={initialTheme}
          buttonStyle={{ color: FG, fontFamily: '"JetBrains Mono", ui-monospace, monospace', fontSize: 12, letterSpacing: '0.08em' }}
          dropdownStyle={{ background: BG, border: `1px solid ${BORDER}`, fontFamily: '"JetBrains Mono", monospace' }}
          itemStyle={{ color: FG, fontSize: 12 }}
          activeItemStyle={{ background: ACCENT, color: '#ffffff' }}
        />
        {/* Search */}
        <div style={{ color: FG }}>
          <SearchEntry />
        </div>
      </nav>
    </div>
  )
}

export function HomeVariantB({
  initialTheme,
  posts,
  navLinks,
  currentPage,
  totalPages,
}: HomeProps) {
  const [hoverId, setHoverId] = useState<string | null>(null)

  const featured = posts[0] ?? null
  const rest = posts.slice(1)

  return (
    <div className="theme-home-editorial" style={{ background: BG, color: FG, minHeight: '100vh', fontFamily: '"PingFang SC", "Noto Sans SC", system-ui, sans-serif' }}>
      <EditorialNavBar initialTheme={initialTheme} navLinks={navLinks} />

      {/* Giant masthead */}
      <div className="editorial-masthead" style={{ padding: '36px 48px 20px', borderBottom: `1px solid ${BORDER}` }}>
        <Link href="/" style={{ textDecoration: 'none', color: 'inherit' }}>
          <h1 className="editorial-masthead-title" style={{
            margin: 0,
            fontSize: 'clamp(72px, 12vw, 180px)',
            fontWeight: 900,
            lineHeight: 0.88,
            letterSpacing: '-0.04em',
            fontFamily: '"Noto Serif SC", "Source Han Serif SC", Georgia, serif',
            color: FG,
          }}>
            文轩<span style={{ color: ACCENT }}>·</span>博客
          </h1>
        </Link>
        <div className="editorial-masthead-meta" style={{
          display: 'flex',
          justifyContent: 'space-between',
          marginTop: 20,
          fontSize: 12,
          color: MUTED,
          fontFamily: '"JetBrains Mono", ui-monospace, monospace',
          letterSpacing: '0.05em',
        }}>
          <span>AI · PRODUCT · INDEPENDENT THINKING</span>
          <span>{posts.length} ARTICLES</span>
        </div>
      </div>

      {/* Featured article */}
      {featured ? (
        <section className="editorial-featured" style={{ padding: '44px 48px', borderBottom: `1px solid ${BORDER}` }}>
          <Link href={`/${featured.slug}`} style={{ textDecoration: 'none', color: 'inherit' }}>
            <div className="editorial-featured-grid" style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 48, alignItems: 'start' }}>
              <div>
                <div style={{
                  fontSize: 10,
                  letterSpacing: '0.25em',
                  color: ACCENT,
                  fontFamily: '"JetBrains Mono", ui-monospace, monospace',
                  marginBottom: 18,
                  textTransform: 'uppercase',
                }}>
                  ★ HEADLINE · 头条
                </div>
                <h2
                  style={{
                    margin: 0,
                    fontSize: 'clamp(28px, 4vw, 52px)',
                    fontWeight: 800,
                    lineHeight: 1.1,
                    letterSpacing: '-0.02em',
                    fontFamily: '"Noto Serif SC", "Source Han Serif SC", Georgia, serif',
                    color: hoverId === featured.slug ? ACCENT : FG,
                    transition: 'color .2s',
                  }}
                  onMouseEnter={() => setHoverId(featured.slug)}
                  onMouseLeave={() => setHoverId(null)}
                >
                  {featured.title}
                  {featured.password && ' 🔒'}
                  {featured.is_pinned === 1 && (
                    <span style={{ fontSize: '0.5em', color: MUTED, marginLeft: 8 }}>置顶</span>
                  )}
                </h2>
                {featured.description && (
                  <p style={{ marginTop: 20, fontSize: 16, lineHeight: 1.8, color: MUTED }}>
                    {featured.description}
                  </p>
                )}
                <div className="editorial-featured-meta" style={{
                  marginTop: 20,
                  display: 'flex',
                  gap: 16,
                  alignItems: 'center',
                  fontSize: 12,
                  color: MUTED,
                  fontFamily: '"JetBrains Mono", ui-monospace, monospace',
                  letterSpacing: '0.05em',
                }}>
                  <span>{formatDate(featured.published_at)}</span>
                  {featured.category && (
                    <>
                      <span>·</span>
                      <span style={{ color: ACCENT }}>{featured.category}</span>
                    </>
                  )}
                  <span style={{ flex: 1, height: 1, background: BORDER }} />
                  <span style={{ color: FG, borderBottom: `1px solid ${FG}`, cursor: 'pointer', paddingBottom: 1 }}>
                    READ →
                  </span>
                </div>
              </div>

              {/* Decorative block */}
              <div className="editorial-featured-art" style={{
                width: 200,
                aspectRatio: '4/5',
                background: `repeating-linear-gradient(45deg, ${BORDER} 0, ${BORDER} 1px, transparent 1px, transparent 10px)`,
                border: `1px solid ${BORDER}`,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
              }}>
                <div style={{
                  fontSize: 'clamp(32px, 5vw, 60px)',
                  fontWeight: 900,
                  color: ACCENT,
                  fontFamily: '"Noto Serif SC", serif',
                  letterSpacing: '-0.05em',
                  lineHeight: 0.9,
                  textAlign: 'center',
                }}>
                  AI<br />·
                </div>
              </div>
            </div>
          </Link>
        </section>
      ) : (
        <section style={{ padding: '72px 48px', borderBottom: `1px solid ${BORDER}`, textAlign: 'center' }}>
          <div style={{ fontSize: 14, letterSpacing: '0.18em', color: MUTED, fontFamily: '"JetBrains Mono", ui-monospace, monospace', textTransform: 'uppercase' }}>
            No articles yet
          </div>
          <div style={{ marginTop: 14, fontSize: 26, fontWeight: 700, lineHeight: 1.3, fontFamily: '"Noto Serif SC", "Source Han Serif SC", Georgia, serif' }}>
            开始写作，记录思考
          </div>
          <div style={{ marginTop: 18 }}>
            <Link
              href="/editor"
              style={{
                color: ACCENT,
                textDecoration: 'none',
                fontSize: 12,
                letterSpacing: '0.12em',
                fontFamily: '"JetBrains Mono", ui-monospace, monospace',
                textTransform: 'uppercase',
                borderBottom: `1px solid ${ACCENT}`,
                paddingBottom: 2,
              }}
            >
              Write Article
            </Link>
          </div>
        </section>
      )}

      {/* Article index grid */}
      {rest.length > 0 && (
        <section className="editorial-index" style={{ padding: '44px 48px', paddingBottom: 80 }}>
          <div className="editorial-index-head" style={{
            display: 'flex',
            alignItems: 'baseline',
            justifyContent: 'space-between',
            marginBottom: 28,
            borderBottom: `2px solid ${FG}`,
            paddingBottom: 10,
          }}>
            <h3 style={{
              margin: 0,
              fontSize: 13,
              fontWeight: 700,
              letterSpacing: '0.2em',
              fontFamily: '"JetBrains Mono", ui-monospace, monospace',
            }}>
              THE INDEX · 文章一览
            </h3>
            <span style={{ fontSize: 10, color: MUTED, fontFamily: '"JetBrains Mono", ui-monospace, monospace', letterSpacing: '0.1em' }}>
              NO.02 — NO.{String(posts.length).padStart(2, '0')}
            </span>
          </div>

          <div className="editorial-index-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '40px 52px' }}>
            {rest.map((post, i) => (
              <Link
                key={post.slug}
                href={`/${post.slug}`}
                style={{ textDecoration: 'none', color: 'inherit', display: 'flex', gap: 18, cursor: 'pointer' }}
                onMouseEnter={() => setHoverId(post.slug)}
                onMouseLeave={() => setHoverId(null)}
              >
                <div style={{
                  fontSize: 44,
                  fontWeight: 800,
                  lineHeight: 1,
                  color: BORDER,
                  fontFamily: '"Noto Serif SC", Georgia, serif',
                  minWidth: 52,
                  letterSpacing: '-0.04em',
                  userSelect: 'none',
                }}>
                  {String(i + 2).padStart(2, '0')}
                </div>
                <div style={{ flex: 1, borderTop: `1px solid ${FG}`, paddingTop: 10 }}>
                  {post.category && (
                    <div style={{
                      fontSize: 10,
                      letterSpacing: '0.2em',
                      color: ACCENT,
                      fontFamily: '"JetBrains Mono", ui-monospace, monospace',
                      marginBottom: 8,
                      textTransform: 'uppercase',
                    }}>
                      {post.category}
                    </div>
                  )}
                  <h4 style={{
                    margin: 0,
                    fontSize: 20,
                    fontWeight: 700,
                    lineHeight: 1.25,
                    letterSpacing: '-0.01em',
                    fontFamily: '"Noto Serif SC", Georgia, serif',
                    color: hoverId === post.slug ? ACCENT : FG,
                    transition: 'color .2s',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                  }}>
                    {post.title}
                    {post.password && (
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ color: MUTED, flexShrink: 0 }}>
                        <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
                        <path d="M7 11V7a5 5 0 0 1 10 0v4"></path>
                      </svg>
                    )}
                    {post.is_pinned === 1 && (
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ color: ACCENT, flexShrink: 0 }}>
                        <line x1="12" y1="17" x2="12" y2="22"></line>
                        <path d="M5 17h14v-1.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V6h1a2 2 0 0 0 0-4H8a2 2 0 0 0 0 4h1v4.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24Z"></path>
                      </svg>
                    )}
                  </h4>
                  {post.description && (
                    <p style={{
                      margin: '8px 0 10px',
                      fontSize: 13,
                      lineHeight: 1.65,
                      color: MUTED,
                      display: '-webkit-box',
                      WebkitLineClamp: 2,
                      WebkitBoxOrient: 'vertical',
                      overflow: 'hidden',
                    }}>
                      {post.description}
                    </p>
                  )}
                  <div style={{ fontSize: 11, color: MUTED, fontFamily: '"JetBrains Mono", ui-monospace, monospace', letterSpacing: '0.04em' }}>
                    {formatDate(post.published_at)}
                  </div>
                </div>
              </Link>
            ))}
          </div>

          <div style={{ paddingTop: 40 }}>
            <Pagination currentPage={currentPage} totalPages={totalPages} basePath="/" />
          </div>
        </section>
      )}

      {/* Footer strip */}
      <div className="editorial-footer-strip" style={{
        borderTop: `2px solid ${FG}`,
        padding: '20px 48px',
        display: 'flex',
        justifyContent: 'space-between',
        fontSize: 11,
        color: MUTED,
        fontFamily: '"JetBrains Mono", ui-monospace, monospace',
        letterSpacing: '0.1em',
      }}>
        <span>© {new Date().getFullYear()} 文轩</span>
        <span>独立 · 不商业化 · RSS 友好</span>
      </div>

      {/* Standard footer with admin entry */}
      <SiteFooter />
    </div>
  )
}

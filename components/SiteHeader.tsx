'use client'

import Link from 'next/link'
import { useState, useRef, useEffect, useSyncExternalStore } from 'react'
import { Menu, X, ChevronDown } from 'lucide-react'
import { SearchEntry } from './SearchEntry'
import { AihotDailyTrigger } from '@/components/AihotDailyTrigger'
import { ThemeDropdown } from '@/components/ThemeDropdown'
import { Tooltip } from '@/components/ui/Tooltip'
import { getClientThemePreference, subscribeToThemeChange, type Theme } from '@/lib/appearance'
import type { SiteCategoryLink, SiteNavLink } from '@/lib/site'

export type NavLink = SiteNavLink

interface SiteHeaderProps {
  navLinks?: NavLink[]
  categories?: SiteCategoryLink[]
  activeCategorySlug?: string | null
  stickyOnMobile?: boolean
  initialTheme?: Theme
}

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

const XiaohongshuIcon = ({ className = "w-4 h-4" }: { className?: string }) => (
  <svg
    viewBox="0 0 24 24"
    fill="currentColor"
    className={className}
    aria-hidden="true"
  >
    <path d="M6.26 4.86c1.24-.26 2.83-.42 4.76-.47 1.93-.05 3.55.01 4.85.19 1.3.18 2.28.55 2.94 1.11.66.56 1 1.4 1 2.52 0 .95-.19 1.73-.57 2.34-.38.61-.94 1.1-1.69 1.45-.74.35-1.67.6-2.77.74-1.1.14-2.38.21-3.83.21-.27 0-.53 0-.79-.01-.25 0-.51-.01-.77-.02l-.15-2.13c.82.03 1.54.05 2.17.05 1.23 0 2.22-.03 2.97-.1.75-.07 1.33-.18 1.73-.35.4-.17.67-.39.82-.67.15-.28.22-.64.22-1.09 0-.48-.14-.84-.43-1.09-.29-.25-.77-.43-1.45-.53-.68-.1-1.61-.14-2.79-.11-1.18.03-2.67.15-4.46.37l-.76-2.21Zm-.08 6.41h2.57l-1.5 7.61H4.68l1.5-7.61Zm5.1 0h2.53l1.54 7.61H12.8l-1.52-7.61Zm4.99-.03h2.72l1.53 7.64h-2.68l-1.57-7.64Z" />
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
  if (
    labelLower.includes('xiaohongshu') ||
    labelLower.includes('rednote') ||
    labelLower.includes('xhs') ||
    labelLower.includes('小红书') ||
    urlLower.includes('xiaohongshu.com') ||
    urlLower.includes('xhslink.com') ||
    urlLower.includes('rednote.com')
  ) {
    return <XiaohongshuIcon className={className} />
  }
  return null
}

const defaultNavLinks: NavLink[] = [
  { label: 'GitHub', url: 'https://github.com/huangwenxuangod', openInNewTab: true },
  { label: 'Twitter', url: 'https://x.com/hungxun254458', openInNewTab: true },
  { label: '小红书', url: 'https://xhslink.com/m/6WFOT2O0BJ0', openInNewTab: true },
  { label: 'RSS', url: '/feed.xml', openInNewTab: false },
]

function getIssueInfo() {
  const now = new Date()
  return { vol: now.getFullYear() - 2023, month: now.getMonth() + 1, year: now.getFullYear() }
}

export function SiteHeader({
  navLinks,
  categories = [],
  activeCategorySlug = null,
  stickyOnMobile = true,
  initialTheme = 'default',
}: SiteHeaderProps) {
  const links = navLinks && navLinks.length > 0 ? navLinks : defaultNavLinks
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const [categoryOpen, setCategoryOpen] = useState(false)
  const categoryRef = useRef<HTMLDivElement>(null)
  const theme = useSyncExternalStore(
    subscribeToThemeChange,
    () => getClientThemePreference(initialTheme),
    () => initialTheme,
  )

  // 点击外部关闭分类下拉
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (categoryRef.current && !categoryRef.current.contains(e.target as Node)) {
        setCategoryOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])
  const activeCategory = categories.find(c => c.slug === activeCategorySlug)

  const renderLink = (link: NavLink, onClick?: () => void) => {
    const socialIcon = getSocialIcon(link.label, link.url, 'h-[16px] w-[16px] shrink-0')
    const hasIcon = Boolean(socialIcon)
    const className = hasIcon
      ? 'inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[var(--editor-muted)] transition-colors duration-150 hover:text-[var(--editor-ink)]'
      : 'inline-flex items-center text-[var(--editor-muted)] transition-colors duration-150 hover:text-[var(--editor-ink)]'

    const content = socialIcon || link.label

    const element = link.openInNewTab || link.url.startsWith('http') ? (
      <a
        key={link.label}
        href={link.url}
        target={link.openInNewTab ? '_blank' : undefined}
        rel={link.openInNewTab ? 'noopener noreferrer' : undefined}
        className={className}
        onClick={onClick}
      >
        {content}
      </a>
    ) : (
      <Link
        key={link.label}
        href={link.url}
        className={className}
        onClick={onClick}
      >
        {content}
      </Link>
    )

    if (hasIcon) {
      return (
        <Tooltip key={link.label} content={link.label} tone="editor">
          {element}
        </Tooltip>
      )
    }

    return element
  }

  const renderLogo = () => {
    if (theme === 'terminal') {
      return (
        <div className="flex items-baseline gap-4 flex-shrink-0" suppressHydrationWarning>
          <Link
            href="/"
            className="text-lg tracking-tight text-[var(--editor-ink)] hover:text-[var(--editor-accent)] transition-colors duration-200 font-bold"
            style={{ fontFamily: 'var(--logo-font, "Noto Serif SC", Georgia, serif)' }}
          >
            文轩
          </Link>
        </div>
      )
    }

    if (theme === 'editorial') {
      const { vol, month, year } = getIssueInfo()
      return (
        <div className="flex items-baseline gap-4 flex-shrink-0" suppressHydrationWarning>
          <Link
            href="/"
            className="text-lg tracking-tight text-[var(--editor-ink)] hover:text-[var(--editor-accent)] transition-colors duration-200 font-bold"
            style={{ fontFamily: 'var(--logo-font, "Noto Serif SC", Georgia, serif)' }}
          >
            文轩
          </Link>
          <span style={{ fontFamily: '"JetBrains Mono", ui-monospace, monospace', fontSize: 11, letterSpacing: '0.15em', color: 'var(--editor-muted)' }}>
            VOL.{vol} · {year}年{month}月
          </span>
        </div>
      )
    }

    return (
      <Link
        href="/"
        className="text-lg tracking-tight text-[var(--editor-ink)] hover:text-[var(--editor-accent)] transition-colors duration-200 flex-shrink-0 font-bold"
        style={{ fontFamily: 'var(--logo-font, Georgia, "Noto Serif SC", serif)' }}
      >
        文轩
      </Link>
    )
  }

  return (
    <header className={`site-header ${stickyOnMobile ? 'sticky' : 'sm:sticky'} top-0 z-40 border-b border-[var(--editor-line)] bg-[var(--background)]/95 backdrop-blur-sm`}>
      <div className="site-header-inner mx-auto max-w-3xl px-4 sm:px-6">
        <div className="h-14 flex items-center justify-between gap-4">
          {renderLogo()}

          {/* Desktop nav */}
          <nav className="hidden sm:flex items-center gap-3 text-sm flex-shrink-0">
            {/* Category dropdown */}
            {categories.length > 0 && (
              <div ref={categoryRef} className="relative">
                <button
                  onClick={() => setCategoryOpen(!categoryOpen)}
                  className={`inline-flex items-center gap-1 transition-colors duration-150 ${
                    activeCategorySlug
                      ? 'text-[var(--editor-accent)]'
                      : 'text-[var(--editor-muted)] hover:text-[var(--editor-ink)]'
                  }`}
                >
                  {activeCategory?.name || '分类'}
                  <ChevronDown className={`w-3.5 h-3.5 transition-transform duration-150 ${categoryOpen ? 'rotate-180' : ''}`} />
                </button>

                {categoryOpen && (
                  <div className="absolute top-full left-0 mt-2 min-w-[140px] rounded-lg border border-[var(--editor-line)] bg-[var(--background)] shadow-lg py-1 z-50">
                    <Link
                      href="/"
                      onClick={() => setCategoryOpen(false)}
                      className={`block px-3 py-2 text-sm transition-colors ${
                        activeCategorySlug === null
                          ? 'text-[var(--editor-accent)] bg-[var(--editor-accent)]/5 font-medium'
                          : 'text-[var(--editor-muted)] hover:text-[var(--editor-ink)] hover:bg-[var(--editor-panel)]'
                      }`}
                    >
                      全部文章
                    </Link>
                    {categories.map(cat => (
                      <Link
                        key={cat.slug}
                        href={`/category/${cat.slug}`}
                        onClick={() => setCategoryOpen(false)}
                        className={`block px-3 py-2 text-sm transition-colors ${
                          activeCategorySlug === cat.slug
                            ? 'text-[var(--editor-accent)] bg-[var(--editor-accent)]/5 font-medium'
                            : 'text-[var(--editor-muted)] hover:text-[var(--editor-ink)] hover:bg-[var(--editor-panel)]'
                        }`}
                      >
                        {cat.name}
                      </Link>
                    ))}
                  </div>
                )}
              </div>
            )}

            {links.map(link => renderLink(link))}
            <AihotDailyTrigger />
            <ThemeDropdown initialTheme={initialTheme} />
            <SearchEntry />
          </nav>

          {/* Mobile: search icon + hamburger */}
          <div className="sm:hidden flex items-center gap-1">
            <AihotDailyTrigger />
            <SearchEntry />
            <button
              className="p-2 text-[var(--editor-muted)] hover:text-[var(--editor-ink)] transition-colors"
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              aria-label={mobileMenuOpen ? '关闭菜单' : '打开菜单'}
            >
              {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>
          </div>
        </div>
      </div>

      {/* Mobile dropdown menu */}
      <div
        className={`
          sm:hidden transition-all duration-300 ease-in-out
          ${mobileMenuOpen ? 'max-h-[70vh] overflow-visible border-t border-[var(--editor-line)]' : 'max-h-0 overflow-hidden'}
        `}
      >
        <div className="bg-[var(--background)]">
          {/* Mobile categories as horizontal pills */}
          {categories.length > 0 && (
            <div className="px-4 py-3 border-b border-[var(--editor-line)]">
              <div className="flex flex-wrap gap-2">
                <Link
                  href="/"
                  onClick={() => setMobileMenuOpen(false)}
                  className={`rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
                    activeCategorySlug === null
                      ? 'bg-[var(--editor-accent)] text-white'
                      : 'bg-[var(--editor-panel)] text-[var(--editor-muted)]'
                  }`}
                >
                  全部
                </Link>
                {categories.map((category) => (
                  <Link
                    key={category.slug}
                    href={`/category/${category.slug}`}
                    onClick={() => setMobileMenuOpen(false)}
                    className={`rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
                      activeCategorySlug === category.slug
                        ? 'bg-[var(--editor-accent)] text-white'
                        : 'bg-[var(--editor-panel)] text-[var(--editor-muted)]'
                    }`}
                  >
                    {category.name}
                  </Link>
                ))}
              </div>
            </div>
          )}

          <nav className="flex flex-col text-sm">
            {links.map(link => (
              <div key={link.label} className="px-4 py-3 border-b border-[var(--editor-line)]">
                {renderLink(link, () => setMobileMenuOpen(false))}
              </div>
            ))}
            <div className="px-4 py-3 border-t border-[var(--editor-line)] text-[var(--editor-muted)]">
              <ThemeDropdown
                initialTheme={initialTheme}
                inlineMenu
                fullWidth
                onThemeChange={() => setMobileMenuOpen(false)}
                buttonStyle={{
                  width: '100%',
                  justifyContent: 'space-between',
                  color: 'var(--editor-muted)',
                  fontSize: 14,
                }}
                dropdownStyle={{
                  background: 'var(--editor-panel)',
                }}
                itemStyle={{
                  padding: '10px 12px',
                  fontSize: 13,
                }}
              />
            </div>
          </nav>
        </div>
      </div>
    </header>
  )
}

'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Search } from 'lucide-react'
import { Dialog, DialogBackdrop, DialogPanel } from '@headlessui/react'
import { cx } from '@/components/ui/primitives'
import { Tooltip } from '@/components/ui/Tooltip'

interface SearchResult {
  slug: string
  title: string
  description: string | null
  category: string | null
  published_at: number
  password: boolean
}

export function SearchBar() {
  const [isOpen, setIsOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<SearchResult[]>([])
  const [loading, setLoading] = useState(false)
  const [selectedIndex, setSelectedIndex] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const router = useRouter()

  useEffect(() => {
    if (isOpen) {
      // Focus input after dialog opens and animation starts
      const timer = setTimeout(() => inputRef.current?.focus(), 80)
      return () => clearTimeout(timer)
    } else {
      setQuery('')
      setResults([])
      setSelectedIndex(0)
    }
  }, [isOpen])

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault()
        setIsOpen(true)
      }
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [])

  useEffect(() => {
    const trimmed = query.trim()
    if (!trimmed) {
      setResults([])
      return
    }

    const timer = setTimeout(async () => {
      setLoading(true)
      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(trimmed)}`)
        const data = (await res.json()) as { results?: SearchResult[] }
        setResults(data.results || [])
        setSelectedIndex(0)
      } catch {
        setResults([])
      } finally {
        setLoading(false)
      }
    }, 250)

    return () => clearTimeout(timer)
  }, [query])

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (results.length > 0 && results[selectedIndex]) {
      router.push(`/${results[selectedIndex].slug}`)
      setIsOpen(false)
    } else if (query.trim()) {
      router.push(`/search?q=${encodeURIComponent(query.trim())}`)
      setIsOpen(false)
    }
  }

  const handleKeyNav = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setSelectedIndex((i) => Math.min(i + 1, results.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setSelectedIndex((i) => Math.max(i - 1, 0))
    }
  }

  const formatDate = (ts: number) => {
    const date = new Date(ts * 1000)
    const now = new Date()
    const diffDays = Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24))
    if (diffDays === 0) return '今天'
    if (diffDays === 1) return '昨天'
    if (diffDays < 7) return `${diffDays}天前`
    return date.toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' })
  }

  return (
    <>
      <Tooltip content="搜索 (⌘K)">
        <button
          onClick={() => setIsOpen(true)}
          className="p-2 text-[var(--editor-muted)] hover:text-[var(--editor-ink)] transition-colors cursor-pointer"
          aria-label="搜索"
        >
          <Search className="w-[18px] h-[18px]" />
        </button>
      </Tooltip>

      <Dialog open={isOpen} onClose={() => setIsOpen(false)} className="relative z-50">
        {/* Backdrop overlay */}
        <DialogBackdrop className="fixed inset-0 bg-black/45 backdrop-blur-[2px] transition duration-200 data-[closed]:opacity-0" />

        {/* Modal container */}
        <div className="fixed inset-0 flex items-start justify-center p-4 pt-[12vh] sm:pt-[18vh] overflow-y-auto">
          <DialogPanel className="ui-modal-panel w-full max-w-[560px] rounded-2xl overflow-hidden transition duration-200 data-[closed]:scale-95 data-[closed]:opacity-0 flex flex-col">
            
            {/* Search Input Area */}
            <form onSubmit={handleSubmit} onKeyDown={handleKeyNav} className="flex items-center gap-3.5 px-5 py-4">
              <Search className="w-5 h-5 text-[var(--editor-accent)] shrink-0" />
              <input
                ref={inputRef}
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="搜索文章..."
                className="flex-1 text-[15px] bg-transparent outline-none placeholder:text-[var(--stone-gray)]/50 text-[var(--editor-ink)] py-0.5"
                autoComplete="off"
                spellCheck={false}
              />
              {loading ? (
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="animate-spin text-[var(--editor-accent)] shrink-0">
                  <path d="M21 12a9 9 0 1 1-6.219-8.56" />
                </svg>
              ) : (
                <kbd className="hidden sm:inline-flex items-center gap-0.5 px-1.5 py-0.5 text-[10px] text-[var(--stone-gray)] bg-[var(--editor-soft)] border border-[var(--editor-line)] rounded font-mono">
                  ESC
                </kbd>
              )}
            </form>

            {/* Divider line */}
            {(results.length > 0 || (query.trim() && !loading)) && (
              <div className="border-t border-[var(--editor-line)]" />
            )}

            {/* Search Results */}
            {results.length > 0 && (
              <div className="max-h-[45vh] overflow-y-auto py-2">
                {results.map((result, index) => {
                  const isSelected = index === selectedIndex
                  return (
                    <Link
                      key={result.slug}
                      href={`/${result.slug}`}
                      onClick={() => setIsOpen(false)}
                      className={cx(
                        'block mx-2.5 px-3.5 py-3 rounded-xl transition-all duration-150',
                        isSelected
                          ? 'bg-[color-mix(in_srgb,var(--editor-accent)_6%,transparent)]'
                          : 'hover:bg-[var(--editor-soft)]/40'
                      )}
                      onMouseEnter={() => setSelectedIndex(index)}
                    >
                      <div className="flex items-center gap-2 mb-1">
                        <h3 className={cx(
                          'text-[14px] font-medium flex-1 line-clamp-1 transition-colors duration-150',
                          isSelected ? 'text-[var(--editor-accent)]' : 'text-[var(--editor-ink)]'
                        )}>
                          {result.title}
                          {result.password && <span className="ml-1.5 text-xs text-[var(--stone-gray)] opacity-80">🔒</span>}
                        </h3>
                        <span className="text-[11px] text-[var(--stone-gray)] tabular-nums shrink-0">
                          {formatDate(result.published_at)}
                        </span>
                      </div>
                      
                      {result.description && (
                        <p className="text-[12px] text-[var(--editor-muted)] line-clamp-1 leading-relaxed">
                          {result.description}
                        </p>
                      )}
                      
                      {result.category && (
                        <span className="inline-block mt-1.5 px-2 py-0.5 rounded-md text-[10px] bg-[color-mix(in_srgb,var(--editor-accent)_8%,transparent)] text-[var(--editor-accent)] font-medium">
                          {result.category}
                        </span>
                      )}
                    </Link>
                  )
                })}
              </div>
            )}

            {/* Empty State (No Results) */}
            {query.trim() && results.length === 0 && !loading && (
              <div className="px-5 py-12 text-center">
                <div className="w-12 h-12 mx-auto mb-4 rounded-full bg-[var(--editor-soft)]/50 flex items-center justify-center">
                  <Search className="w-5 h-5 text-[var(--editor-muted)]" />
                </div>
                <p className="text-[14px] font-medium text-[var(--editor-ink)]">没有找到相关文章</p>
                <p className="text-[12px] text-[var(--stone-gray)] mt-1">试试其他关键词</p>
              </div>
            )}

            {/* Footer keyboard shortcuts */}
            {results.length > 0 && (
              <div className="flex items-center gap-4 px-5 py-3 border-t border-[var(--editor-line)] bg-[var(--editor-soft)]/10">
                <div className="flex items-center gap-1.5 text-[11px] text-[var(--stone-gray)]">
                  <kbd className="px-1.5 py-0.5 bg-[var(--editor-panel)] border border-[var(--editor-line)] rounded text-[10px] font-mono shadow-sm">↑↓</kbd>
                  <span>选择</span>
                </div>
                <div className="flex items-center gap-1.5 text-[11px] text-[var(--stone-gray)]">
                  <kbd className="px-1.5 py-0.5 bg-[var(--editor-panel)] border border-[var(--editor-line)] rounded text-[10px] font-mono shadow-sm">↵</kbd>
                  <span>打开</span>
                </div>
                <div className="flex items-center gap-1.5 text-[11px] text-[var(--stone-gray)]">
                  <kbd className="px-1.5 py-0.5 bg-[var(--editor-panel)] border border-[var(--editor-line)] rounded text-[10px] font-mono shadow-sm">esc</kbd>
                  <span>关闭</span>
                </div>
              </div>
            )}
          </DialogPanel>
        </div>
      </Dialog>
    </>
  )
}

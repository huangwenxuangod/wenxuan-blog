'use client'

import { useEffect, useState } from 'react'
import { Moon, Sun } from 'lucide-react'
import { BACKOFFICE_THEME_STORAGE_KEY, type BackofficeThemeMode } from '@/lib/backoffice-theme'

function getPreferredAdminTheme(): BackofficeThemeMode {
  if (typeof window === 'undefined') return 'light'

  const saved = window.localStorage.getItem(BACKOFFICE_THEME_STORAGE_KEY)
  if (saved === 'light' || saved === 'dark') {
    return saved
  }

  return 'light'
}

function applyAdminTheme(theme: BackofficeThemeMode) {
  if (typeof document === 'undefined') return

  document.documentElement.setAttribute('data-admin-theme', theme)
}

export function AdminThemeToggle() {
  const [theme, setTheme] = useState<BackofficeThemeMode>('light')
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    const initialTheme = getPreferredAdminTheme()
    setTheme(initialTheme)
    applyAdminTheme(initialTheme)
    setMounted(true)
  }, [])

  const toggleTheme = () => {
    const nextTheme = theme === 'light' ? 'dark' : 'light'
    setTheme(nextTheme)
    window.localStorage.setItem(BACKOFFICE_THEME_STORAGE_KEY, nextTheme)
    applyAdminTheme(nextTheme)
  }

  const nextLabel = theme === 'light' ? '切换到暗色模式' : '切换到亮色模式'
  const Icon = mounted && theme === 'dark' ? Sun : Moon

  return (
    <button
      type="button"
      onClick={toggleTheme}
      className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-[var(--admin-line)] bg-[var(--admin-surface)] text-[var(--admin-ink)] transition-colors hover:bg-[var(--admin-soft)]"
      title={nextLabel}
      aria-label={nextLabel}
    >
      <Icon className="h-4 w-4" strokeWidth={1.75} />
    </button>
  )
}

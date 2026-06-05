'use client'

import { useEffect, useState } from 'react'
import { Moon, Sun } from 'lucide-react'
import { UiIconButton } from '@/components/ui/primitives'
import { Tooltip } from '@/components/ui/Tooltip'
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
    // eslint-disable-next-line react-hooks/set-state-in-effect
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
    <Tooltip content={nextLabel}>
      <UiIconButton
        onClick={toggleTheme}
        className="h-10 w-10"
        aria-label={nextLabel}
      >
        <Icon className="h-4 w-4" strokeWidth={1.75} />
      </UiIconButton>
    </Tooltip>
  )
}

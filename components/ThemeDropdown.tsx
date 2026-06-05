'use client'

import { Menu, MenuButton, MenuItem, MenuItems } from '@headlessui/react'
import { ChevronDown } from 'lucide-react'
import { useSyncExternalStore } from 'react'
import type { CSSProperties } from 'react'
import { cx } from '@/components/ui/primitives'
import {
  getClientThemePreference,
  subscribeToThemeChange,
  THEME_CHANGE_EVENT,
  THEME_OPTIONS,
  THEME_STORAGE_KEY,
  type Theme,
} from '@/lib/appearance'

export type { Theme }

export function dispatchThemeChange(theme: Theme) {
  if (typeof window === 'undefined') return
  window.dispatchEvent(new CustomEvent(THEME_CHANGE_EVENT, { detail: { theme } }))
}

interface ThemeDropdownProps {
  inlineMenu?: boolean
  fullWidth?: boolean
  initialTheme?: Theme
  onThemeChange?: (theme: Theme) => void
  buttonStyle?: CSSProperties
  dropdownStyle?: CSSProperties
  itemStyle?: CSSProperties
  activeItemStyle?: CSSProperties
}

export function ThemeDropdown({
  inlineMenu = false,
  fullWidth = false,
  initialTheme = 'default',
  onThemeChange,
  buttonStyle,
  dropdownStyle,
  itemStyle,
  activeItemStyle,
}: ThemeDropdownProps = {}) {
  const theme = useSyncExternalStore(
    subscribeToThemeChange,
    () => getClientThemePreference(initialTheme),
    () => initialTheme,
  )

  const handleChange = (nextTheme: Theme) => {
    localStorage.setItem(THEME_STORAGE_KEY, nextTheme)
    if (nextTheme === 'default') {
      document.documentElement.removeAttribute('data-theme')
    } else {
      document.documentElement.setAttribute('data-theme', nextTheme)
    }
    dispatchThemeChange(nextTheme)
    onThemeChange?.(nextTheme)
  }

  return (
    <Menu as="div" className={cx('relative', fullWidth && 'w-full')}>
      <MenuButton
        style={buttonStyle}
        className={cx(
          'inline-flex cursor-pointer items-center gap-1 text-[inherit] transition-colors hover:text-[var(--editor-ink)]',
          fullWidth && 'w-full justify-between',
        )}
      >
        <span>主题</span>
        <ChevronDown className="h-3.5 w-3.5 text-[var(--editor-muted)] transition duration-150 ui-open:rotate-180" />
      </MenuButton>

      <MenuItems
        anchor={inlineMenu ? undefined : 'bottom start'}
        transition
        style={dropdownStyle}
        className={cx(
          'theme-dropdown-panel z-50 min-w-[13.5rem] overflow-hidden rounded-[1.1rem] p-1.5 outline-none transition duration-150 ease-out data-[closed]:translate-y-1 data-[closed]:opacity-0',
          inlineMenu ? 'mt-2 w-full' : 'mt-2',
        )}
      >
        {THEME_OPTIONS.map((option) => {
          const active = theme === option.id
          return (
            <MenuItem key={option.id}>
              <button
                type="button"
                onClick={() => handleChange(option.id)}
                style={active ? { ...itemStyle, ...activeItemStyle } : itemStyle}
                className={cx(
                  'group flex w-full cursor-pointer items-start gap-3 rounded-[0.9rem] px-3 py-2.5 text-left transition',
                  active
                    ? 'bg-[color-mix(in_srgb,var(--editor-accent)_12%,var(--editor-panel))] text-[var(--editor-ink)]'
                    : 'text-[var(--editor-ink)] data-[focus]:bg-[color-mix(in_srgb,var(--editor-line)_36%,transparent)]',
                )}
              >
                <span
                  className={cx(
                    'mt-[0.35rem] h-2 w-2 shrink-0 rounded-full transition-colors',
                    active
                      ? 'bg-[var(--editor-accent)]'
                      : 'bg-[color-mix(in_srgb,var(--editor-line-strong)_70%,transparent)] group-data-[focus]:bg-[color-mix(in_srgb,var(--editor-muted)_60%,transparent)]',
                  )}
                />
                <span className="min-w-0 flex-1">
                  <span className={cx('block text-sm leading-5', active ? 'font-medium text-[var(--editor-ink)]' : 'text-[var(--editor-ink)]')}>
                    {option.label}
                  </span>
                  <span className="mt-0.5 block text-xs leading-5 text-[color-mix(in_srgb,var(--editor-muted)_90%,transparent)]">
                    {option.description}
                  </span>
                </span>
              </button>
            </MenuItem>
          )
        })}
      </MenuItems>
    </Menu>
  )
}

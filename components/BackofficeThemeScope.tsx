'use client'

import { useEffect } from 'react'

export function BackofficeThemeScope() {
  useEffect(() => {
    const root = document.documentElement
    const previousTheme = root.getAttribute('data-theme')

    root.setAttribute('data-backoffice-surface', 'true')
    root.removeAttribute('data-theme')

    return () => {
      root.removeAttribute('data-backoffice-surface')
      if (previousTheme) {
        root.setAttribute('data-theme', previousTheme)
      } else {
        root.removeAttribute('data-theme')
      }
    }
  }, [])

  return null
}

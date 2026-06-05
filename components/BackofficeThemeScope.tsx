'use client'

import { useEffect } from 'react'

export function BackofficeThemeScope() {
  useEffect(() => {
    document.documentElement.setAttribute('data-backoffice-surface', 'true')

    return () => {
      document.documentElement.removeAttribute('data-backoffice-surface')
    }
  }, [])

  return null
}

import { normalizeTheme, type Theme } from '@/lib/appearance'
import { getPublicCategories } from '@/lib/repositories/categories'
import { getSetting } from '@/lib/repositories/settings'

export interface SiteNavLink {
  label: string
  url: string
  openInNewTab: boolean
}

export interface SiteCategoryLink {
  name: string
  slug: string
}

export async function getSiteHeaderData(db: D1Database): Promise<{
  navLinks: SiteNavLink[]
  categories: SiteCategoryLink[]
  defaultTheme: Theme
}> {
  let navLinks: SiteNavLink[] = []
  let categories: SiteCategoryLink[] = []
  let defaultTheme: Theme = 'default'

  try {
    const [navJson, categoryRows, themeValue] = await Promise.all([
      getSetting(db, 'nav_links'),
      getPublicCategories(db),
      getSetting(db, 'default_theme'),
    ])

    if (navJson) {
      try {
        const parsed = JSON.parse(navJson)
        if (Array.isArray(parsed)) {
          navLinks = parsed.filter((link): link is SiteNavLink => (
            typeof link?.label === 'string' &&
            typeof link?.url === 'string' &&
            typeof link?.openInNewTab === 'boolean' &&
            !link.url.startsWith('/admin')
          ))
        }
      } catch {}
    }

    categories = categoryRows
      .filter((category) => category.slug && category.name)
      .map((category) => ({
        name: category.name,
        slug: category.slug,
      }))

    defaultTheme = normalizeTheme(themeValue)
  } catch {
    // Keep graceful fallback behavior for public pages
  }

  return { navLinks, categories, defaultTheme }
}

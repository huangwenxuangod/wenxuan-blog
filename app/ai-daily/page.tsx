import { AihotDailyPageShell } from '@/components/AihotDailyPageShell'
import { SiteFooter } from '@/components/SiteFooter'
import { SiteHeader } from '@/components/SiteHeader'
import { getAppCloudflareEnv } from '@/lib/cloudflare'
import type { Theme } from '@/lib/appearance'
import { getSiteHeaderData, type SiteCategoryLink, type SiteNavLink } from '@/lib/site'

export const metadata = {
  title: 'AI 日报',
}

export default async function AihotDailyPage() {
  let navLinks: SiteNavLink[] = []
  let categories: SiteCategoryLink[] = []
  let defaultTheme: Theme = 'default'

  try {
    const env = await getAppCloudflareEnv()
    if (env?.DB) {
      const headerData = await getSiteHeaderData(env.DB)
      navLinks = headerData.navLinks
      categories = headerData.categories
      defaultTheme = headerData.defaultTheme
    }
  } catch (error) {
    console.error('AI daily page: failed to fetch header data', error)
  }

  return (
    <div className="min-h-full flex flex-col bg-[var(--background)]">
      <SiteHeader
        initialTheme={defaultTheme}
        navLinks={navLinks}
        categories={categories}
      />
      <main className="mx-auto flex w-full max-w-3xl flex-1 px-4 py-10 sm:px-6 sm:py-14">
        <AihotDailyPageShell />
      </main>
      <SiteFooter />
    </div>
  )
}

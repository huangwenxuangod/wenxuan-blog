import { AihotDailyPageShell } from '@/components/AihotDailyPageShell'
import { SiteFooter } from '@/components/SiteFooter'
import { SiteHeader } from '@/components/SiteHeader'
import type { AihotDailyListItem, AihotDailyRecord } from '@/lib/aihot-daily'
import { getAihotDailyByDate, getLatestAihotDaily, listAihotDailies } from '@/lib/aihot-daily'
import { getAppCloudflareEnv } from '@/lib/cloudflare'
import type { Theme } from '@/lib/appearance'
import { getSiteHeaderData, type SiteCategoryLink, type SiteNavLink } from '@/lib/site'

export const metadata = {
  title: 'AI 日报',
}

export default async function AihotDailyPage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string }>
}) {
  const resolvedSearchParams = await searchParams
  const requestedDate = typeof resolvedSearchParams?.date === 'string'
    ? resolvedSearchParams.date.trim()
    : ''
  let navLinks: SiteNavLink[] = []
  let categories: SiteCategoryLink[] = []
  let defaultTheme: Theme = 'default'
  let archive: AihotDailyListItem[] = []
  let daily: AihotDailyRecord | null = null

  try {
    const env = await getAppCloudflareEnv()
    if (env?.DB) {
      const headerData = await getSiteHeaderData(env.DB)
      navLinks = headerData.navLinks
      categories = headerData.categories
      defaultTheme = headerData.defaultTheme
      archive = await listAihotDailies(env.DB, 120)
      daily = requestedDate
        ? await getAihotDailyByDate(env.DB, requestedDate)
        : await getLatestAihotDaily(env.DB)

      if (!daily && archive[0]?.date) {
        daily = await getAihotDailyByDate(env.DB, archive[0].date)
      }
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
      <main className="mx-auto flex w-full max-w-6xl flex-1 px-4 py-10 sm:px-6 sm:py-14">
        <AihotDailyPageShell
          daily={daily}
          archive={archive}
          selectedDate={requestedDate || null}
        />
      </main>
      <SiteFooter />
    </div>
  )
}

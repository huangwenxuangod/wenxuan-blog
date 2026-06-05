import {
  isWorkersAiBaseUrl,
  resolveAiProfileConfig,
} from '@/lib/ai-provider-profiles'

export async function resolveWorkersAiProfile(
  db: D1Database,
  secret: string,
  preferredProfileId?: number,
) {
  const preferredProfile = Number.isFinite(preferredProfileId) && Number(preferredProfileId) > 0
    ? await resolveAiProfileConfig(db, secret, Number(preferredProfileId))
    : null

  if (preferredProfile && (
    preferredProfile.provider === 'workers_ai'
    || isWorkersAiBaseUrl(preferredProfile.base_url)
  )) {
    return preferredProfile
  }

  const row = await db.prepare(`
    SELECT id
    FROM ai_provider_profiles
    WHERE provider = 'workers_ai'
       OR base_url LIKE '%api.cloudflare.com/client/v4/accounts/%/ai/%'
    ORDER BY is_default DESC, updated_at DESC, id DESC
    LIMIT 1
  `).first<{ id: number }>()

  if (!row?.id) return null
  return resolveAiProfileConfig(db, secret, row.id)
}

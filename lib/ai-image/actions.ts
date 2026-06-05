import type { AIImageAspectRatio, AIImageResolution } from './options'

interface ResolvedImageAction {
  action_key: string
  label: string
  prompt: string
  aspect_ratio: AIImageAspectRatio
  resolution: AIImageResolution
  size: string
  quality: string
  profile_id: number | null
}

export async function resolveImageAction(
  db: D1Database,
  action: string,
): Promise<ResolvedImageAction | null> {
  if (action === 'custom') return null

  const row = await db.prepare(`
    SELECT action_key, label, prompt, aspect_ratio, resolution, size, quality, profile_id
    FROM ai_image_actions
    WHERE action_key = ? AND is_enabled = 1
  `).bind(action).first<ResolvedImageAction>()

  if (!row) {
    throw new Error('不支持的图片快捷提示')
  }

  return row
}

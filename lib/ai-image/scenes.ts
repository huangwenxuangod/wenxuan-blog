import type { AIImageSceneBindingRow } from './config'
import { ensureAiImageConfigInfrastructure } from './config'

export async function listAiImageSceneBindings(db: D1Database) {
  await ensureAiImageConfigInfrastructure(db)

  const { results } = await db.prepare(`
    SELECT scene_key, action_key, updated_at
    FROM ai_image_scene_bindings
    ORDER BY scene_key ASC
  `).all<AIImageSceneBindingRow>()

  return results || []
}

export async function resolveImageSceneBinding(
  db: D1Database,
  sceneKey: string,
) {
  await ensureAiImageConfigInfrastructure(db)

  const normalizedSceneKey = sceneKey.trim()
  if (!normalizedSceneKey) return null

  return db.prepare(`
    SELECT scene_key, action_key, updated_at
    FROM ai_image_scene_bindings
    WHERE scene_key = ?
    LIMIT 1
  `).bind(normalizedSceneKey).first<AIImageSceneBindingRow>()
}

export async function saveAiImageSceneBindings(
  db: D1Database,
  bindings: Record<string, string>,
) {
  await ensureAiImageConfigInfrastructure(db)

  for (const [sceneKey, actionKey] of Object.entries(bindings)) {
    const normalizedSceneKey = sceneKey.trim()
    const normalizedActionKey = actionKey.trim()
    if (!normalizedSceneKey || !normalizedActionKey) continue

    await db.prepare(`
      INSERT INTO ai_image_scene_bindings (scene_key, action_key, updated_at)
      VALUES (?, ?, strftime('%s', 'now'))
      ON CONFLICT(scene_key) DO UPDATE SET
        action_key = excluded.action_key,
        updated_at = excluded.updated_at
    `).bind(normalizedSceneKey, normalizedActionKey).run()
  }
}

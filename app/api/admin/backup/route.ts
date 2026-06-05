import { isAdminAuthenticated, COOKIE_NAME } from '@/lib/admin-auth'
import { getRouteEnvWithDb, jsonOk, AppError, withRouteErrorHandling } from '@/lib/server/route-helpers'
import { cookies } from 'next/headers'

async function checkAuth() {
  const cookieStore = await cookies()
  const token = cookieStore.get(COOKIE_NAME)?.value
  return isAdminAuthenticated(token)
}

export const GET = withRouteErrorHandling(async () => {
  if (!(await checkAuth())) {
    throw AppError.unauthorized()
  }

  const route = await getRouteEnvWithDb('DB not available')
  if (!route.ok) {
    throw AppError.dbUnavailable()
  }

  // 1. Fetch all posts (including content & html)
  const { results: posts } = await route.db
    .prepare(
      `SELECT id, slug, title, content, html, description, category, tags, status, password, is_pinned, is_hidden, cover_image, published_at, updated_at, view_count, deleted_at FROM posts ORDER BY published_at DESC`
    )
    .all()

  // 2. Fetch all categories
  const { results: categories } = await route.db
    .prepare(`SELECT id, name, slug, post_count FROM categories`)
    .all()

  // 3. Fetch all site settings
  const { results: settings } = await route.db
    .prepare(`SELECT key, value FROM site_settings`)
    .all()

  return jsonOk({
    posts,
    categories,
    settings,
  })
})

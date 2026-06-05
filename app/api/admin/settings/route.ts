import { getSetting, setSetting } from '@/lib/db'
import { isAdminAuthenticated, COOKIE_NAME } from '@/lib/admin-auth'
import { getRouteEnvWithDb, jsonError, jsonOk, parseJsonBody } from '@/lib/server/route-helpers'
import { cookies } from 'next/headers'
import type { NextRequest } from 'next/server'

async function checkAuth() {
  const cookieStore = await cookies()
  const token = cookieStore.get(COOKIE_NAME)?.value
  return isAdminAuthenticated(token)
}

export async function GET(req: NextRequest) {
  if (!(await checkAuth())) {
    return jsonError('Unauthorized', 401)
  }

  try {
    const route = await getRouteEnvWithDb('No DB')
    if (!route.ok) return route.response

    const key = req.nextUrl.searchParams.get('key')
    if (!key) {
      // Return all common settings for client-side settings modal
      const nav_links = await getSetting(route.db, 'nav_links') || ''
      const custom_js = await getSetting(route.db, 'custom_js') || ''
      const body_font = await getSetting(route.db, 'body_font') || ''
      const default_theme = await getSetting(route.db, 'default_theme') || ''

      return jsonOk({
        nav_links,
        custom_js,
        body_font,
        default_theme
      })
    }

    const value = await getSetting(route.db, key)
    return jsonOk({ key, value })
  } catch (error) {
    console.error('Get setting error:', error)
    return jsonError(error instanceof Error ? error.message : '获取设置失败', 500)
  }
}

export async function POST(req: NextRequest) {
  if (!(await checkAuth())) {
    return jsonError('Unauthorized', 401)
  }

  try {
    const { key, value } = await parseJsonBody<{ key?: string; value?: unknown }>(req)
    if (!key || value === undefined) {
      return jsonError('Missing key or value', 400)
    }

    const route = await getRouteEnvWithDb('No DB')
    if (!route.ok) return route.response

    await setSetting(route.db, key, typeof value === 'string' ? value : JSON.stringify(value))
    return jsonOk({ success: true })
  } catch (error) {
    console.error('Set setting error:', error)
    return jsonError(error instanceof Error ? error.message : '保存设置失败', 500)
  }
}

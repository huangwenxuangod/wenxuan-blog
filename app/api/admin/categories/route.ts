import { getCategories, createCategory, updateCategory, deleteCategory, migratePostsToCategory } from '@/lib/db'
import {
  ensureAuthenticatedRequest,
  getRouteEnvWithDb,
  jsonError,
  jsonOk,
  parseJsonBody,
} from '@/lib/server/route-helpers'
import type { NextRequest } from 'next/server'
import {
  createRequestId,
  logServerEvent,
  serverErrorResponse,
  withRequestId,
} from '@/lib/server/observability'

interface CreateCategoryBody {
  name?: string
  slug?: string
}

interface UpdateCategoryBody {
  oldSlug?: string
  name?: string
  slug?: string
}

interface DeleteCategoryBody {
  slug?: string
}

export async function GET(req: NextRequest) {
  const requestId = createRequestId(req)
  const routeName = '/api/admin/categories'
  try {
    const route = await getRouteEnvWithDb('DB not available')
    if (!route.ok) return withRequestId(route.response, requestId)

    // 分类列表允许 Bearer Token 访问（Obsidian/Chrome 插件需要）
    const authError = await ensureAuthenticatedRequest(req, route.db)
    if (authError) return withRequestId(authError, requestId)

    const categories = await getCategories(route.db)
    const hasUncategorized = categories.some((category) => category.name === '未分类' || category.slug === 'uncategorized')

    if (hasUncategorized) {
      await migratePostsToCategory(route.db, '未分类', 'AI', 'ai')
    }

    const nextCategories = await getCategories(route.db)
    const visibleCategories = nextCategories.filter((category) => category.name !== '未分类')
    logServerEvent('info', 'CATEGORY_LIST_SUCCEEDED', {
      requestId,
      route: routeName,
      method: 'GET',
      context: { count: visibleCategories.length },
    })
    return withRequestId(jsonOk({ categories: visibleCategories }), requestId)
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    if (message.includes('no such table: categories')) {
      return withRequestId(jsonOk({ categories: [] }), requestId)
    }
    return serverErrorResponse({
      requestId,
      route: routeName,
      method: 'GET',
      code: 'CATEGORY_LIST_FAILED',
      message: '分类读取失败',
      details: message,
      error: err,
    })
  }
}

export async function POST(req: NextRequest) {
  try {
    const route = await getRouteEnvWithDb('DB not available')
    if (!route.ok) return route.response
    const authError = await ensureAuthenticatedRequest(req, route.db, '未授权')
    if (authError) return authError

    const { name, slug } = await parseJsonBody<CreateCategoryBody>(req)
    if (!name || !slug) {
      return jsonError('名称和slug不能为空', 400)
    }

    await createCategory(route.db, name, slug)
    return jsonOk({ success: true })
  } catch (err) {
    return jsonError(String(err), 500)
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const route = await getRouteEnvWithDb('DB not available')
    if (!route.ok) return route.response
    const authError = await ensureAuthenticatedRequest(req, route.db, '未授权')
    if (authError) return authError

    const { oldSlug, name, slug } = await parseJsonBody<UpdateCategoryBody>(req)
    if (!oldSlug || !name || !slug) {
      return jsonError('参数不完整', 400)
    }

    await updateCategory(route.db, oldSlug, name, slug)
    return jsonOk({ success: true })
  } catch (err) {
    return jsonError(String(err), 500)
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const route = await getRouteEnvWithDb('DB not available')
    if (!route.ok) return route.response
    const authError = await ensureAuthenticatedRequest(req, route.db, '未授权')
    if (authError) return authError

    const { slug } = await parseJsonBody<DeleteCategoryBody>(req)
    if (!slug) {
      return jsonError('slug不能为空', 400)
    }

    await deleteCategory(route.db, slug)
    return jsonOk({ success: true })
  } catch (err) {
    return jsonError(String(err), 500)
  }
}

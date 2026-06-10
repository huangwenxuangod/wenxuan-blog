export interface ClientCategory {
  name: string
  slug: string
  post_count?: number
}

interface CategoriesResponse {
  categories?: ClientCategory[]
}

const AI_FALLBACK_CATEGORY: ClientCategory = {
  name: 'AI',
  slug: 'ai',
}

export function normalizeVisibleCategories(categories: ClientCategory[]): ClientCategory[] {
  const filtered = categories.filter((category) => category.name !== '未分类')
  const hasAi = filtered.some((category) => category.name === 'AI')
  return hasAi ? filtered : [AI_FALLBACK_CATEGORY, ...filtered]
}

export async function fetchAdminCategories(): Promise<ClientCategory[]> {
  const response = await fetch('/api/admin/categories')

  if (!response.ok) {
    throw new Error(`Failed to fetch categories: ${response.status}`)
  }

  const data = await response.json() as ClientCategory[] | CategoriesResponse
  const categories = Array.isArray(data) ? data : data?.categories

  if (!Array.isArray(categories)) {
    return [AI_FALLBACK_CATEGORY]
  }

  const normalized = normalizeVisibleCategories(categories)
  return normalized.length > 0 ? normalized : [AI_FALLBACK_CATEGORY]
}

// ⚡ 动态按需加载 — 未配置 TAVILY_API_KEY 时不进入主 bundle
// 零 npm 依赖，基于 Workers 原生 fetch

export interface WebSearchResult {
  query: string
  answer: string
  results: Array<{
    title: string
    url: string
    content: string
    score: number
  }>
}

export async function executeWebSearch(
  payload: { query: string; maxResults?: number },
  env?: CloudflareEnv | null,
): Promise<WebSearchResult> {
  const apiKey = env?.TAVILY_API_KEY || process.env.TAVILY_API_KEY
  if (!apiKey) throw new Error('TAVILY_API_KEY 未配置')

  const response = await fetch('https://api.tavily.com/search', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      api_key: apiKey,
      query: payload.query,
      max_results: Math.min(payload.maxResults || 5, 10),
      search_depth: 'basic',
      include_answer: true,
      include_raw_content: false,
    }),
  })

  if (!response.ok) throw new Error(`Tavily 返回 ${response.status}`)

  const data = await response.json() as {
    query: string
    answer?: string
    results?: Array<{
      title: string
      url: string
      content: string
      score: number
    }>
  }

  return {
    query: data.query,
    answer: data.answer || '',
    results: (data.results || []).slice(0, 10),
  }
}

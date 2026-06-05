export class ApiClientError extends Error {
  public code: string
  public requestId: string
  public details?: string
  public hint?: string
  public status: number

  constructor(options: {
    message: string
    code: string
    requestId: string
    details?: string
    hint?: string
    status: number
  }) {
    super(options.message)
    this.name = 'ApiClientError'
    this.code = options.code
    this.requestId = options.requestId
    this.details = options.details
    this.hint = options.hint
    this.status = options.status

    Object.setPrototypeOf(this, ApiClientError.prototype)
  }
}

/**
 * 解析 API 响应中的结构化错误
 */
export async function parseApiError(response: Response): Promise<ApiClientError> {
  const status = response.status
  let message = `请求失败 (HTTP ${status})`
  let code = 'HTTP_ERROR'
  let requestId = 'unknown'
  let details: string | undefined = undefined
  let hint: string | undefined = undefined

  try {
    const data = await response.json() as {
      error?: string | {
        message?: string
        code?: string
        requestId?: string
        details?: string
        hint?: string
      }
    } | null
    if (data && data.error && typeof data.error === 'object') {
      message = data.error.message || message
      code = data.error.code || code
      requestId = data.error.requestId || requestId
      details = data.error.details
      hint = data.error.hint
    } else if (data && typeof data.error === 'string') {
      message = data.error
    }
  } catch {
    // 忽略 JSON 解析失败，保留默认的 HTTP 状态错误
  }

  return new ApiClientError({
    message,
    code,
    requestId,
    details,
    hint,
    status,
  })
}

/**
 * 带有统一错误处理的 fetch 封装
 */
export async function fetchApi(url: string, init?: RequestInit): Promise<Response> {
  const response = await fetch(url, init)
  if (!response.ok) {
    throw await parseApiError(response)
  }
  return response
}

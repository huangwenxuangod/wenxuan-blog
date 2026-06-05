import { NextRequest, NextResponse } from 'next/server'
import { authenticateRequest } from '@/lib/admin-auth'
import { getAppCloudflareContext, getAppCloudflareEnv } from '@/lib/cloudflare'

export type RouteDbEnv = Partial<CloudflareEnv> & { DB: D1Database }

export class AppError extends Error {
  public code: string
  public status: number
  public details?: unknown
  public hint?: string

  constructor(options: {
    message: string
    code?: string
    status?: number
    details?: unknown
    hint?: string
  }) {
    super(options.message)
    this.name = 'AppError'
    this.code = options.code || 'INTERNAL_SERVER_ERROR'
    this.status = options.status || 500
    this.details = options.details
    this.hint = options.hint

    // Ensure proper prototype chain
    Object.setPrototypeOf(this, AppError.prototype)
  }

  static unauthorized(message = '未授权，请先登录', hint = '请先登录管理员账户') {
    return new AppError({ message, code: 'UNAUTHORIZED', status: 401, hint })
  }

  static badRequest(message: string, hint?: string) {
    return new AppError({ message, code: 'BAD_REQUEST', status: 400, hint })
  }

  static notFound(message: string, hint?: string) {
    return new AppError({ message, code: 'NOT_FOUND', status: 404, hint })
  }

  static dbUnavailable(message = '数据库未就绪', hint = '请检查 Cloudflare D1 数据库绑定或配置') {
    return new AppError({ message, code: 'DB_UNAVAILABLE', status: 500, hint })
  }

  static aiProviderError(message: string, hint = '请检查 AI 接口商配置、额度或网络连接') {
    return new AppError({ message, code: 'AI_PROVIDER_ERROR', status: 500, hint })
  }
}

export type ApiErrorResponse = {
  error: {
    code: string
    message: string
    requestId: string
    details?: string
    hint?: string
  }
}

export function withRouteErrorHandling(
  handler: (req: NextRequest, ctx: unknown) => Promise<Response | NextResponse | void>
) {
  return async (req: NextRequest, ctx: unknown): Promise<Response | NextResponse | void> => {
    const requestId = typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2)
    try {
      return await handler(req, ctx)
    } catch (error) {
      // 1. Log the error with the requestId
      console.error(`[Route Error] RequestID: ${requestId} | Path: ${req.nextUrl?.pathname || 'unknown'} | Error:`, error)

      // 2. Determine response values
      let status = 500
      let code = 'INTERNAL_SERVER_ERROR'
      let message = '服务器内部错误'
      let details: string | undefined = undefined
      let hint: string | undefined = undefined

      if (error instanceof AppError) {
        status = error.status
        code = error.code
        message = error.message
        hint = error.hint
        if (error.details) {
          details = typeof error.details === 'string' ? error.details : JSON.stringify(error.details)
        }
      } else if (error instanceof Error) {
        message = error.message
        details = error.stack
      } else {
        details = String(error)
      }

      // 3. Security Boundary Check
      const isDev = process.env.NODE_ENV === 'development'
      let enableVerbose = false
      try {
        const env = await getAppCloudflareEnv()
        enableVerbose = (env as Record<string, string | undefined> | null | undefined)?.ENABLE_VERBOSE_API_ERRORS === 'true'
      } catch {
        // ignore
      }

      const shouldShowDetails = isDev || enableVerbose

      const responseBody: ApiErrorResponse = {
        error: {
          code,
          message: error instanceof AppError ? message : (shouldShowDetails ? message : '服务器内部错误'),
          requestId,
          ...(shouldShowDetails && details ? { details } : {}),
          ...(hint ? { hint } : {}),
        },
      }

      return NextResponse.json(responseBody, { status })
    }
  }
}

type RouteEnvWithDbResult =
  | {
      ok: true
      env: RouteDbEnv
      db: D1Database
    }
  | {
      ok: false
      response: NextResponse
    }

type RouteContextWithDbResult =
  | {
      ok: true
      env: RouteDbEnv
      db: D1Database
      ctx: Awaited<ReturnType<typeof getAppCloudflareContext>>['ctx']
    }
  | {
      ok: false
      response: NextResponse
    }

export function jsonOk<T>(payload: T, status = 200) {
  return NextResponse.json(payload, { status })
}

export function jsonError(error: string, status = 500) {
  return NextResponse.json({ error }, { status })
}

export async function parseJsonBody<T>(
  req: NextRequest,
  invalidMessage = '请求体不是有效 JSON',
): Promise<T> {
  try {
    return await req.json() as T
  } catch {
    throw new Error(invalidMessage)
  }
}

export async function getRouteEnvWithDb(missingDbMessage = 'DB unavailable'): Promise<RouteEnvWithDbResult> {
  const env = await getAppCloudflareEnv()
  const db = env?.DB as D1Database | undefined

  if (!db) {
    return {
      ok: false,
      response: jsonError(missingDbMessage, 500),
    }
  }

  return {
    ok: true,
    env: env as RouteDbEnv,
    db,
  }
}

export async function getRouteContextWithDb(
  missingDbMessage = 'DB unavailable',
): Promise<RouteContextWithDbResult> {
  const cf = await getAppCloudflareContext()
  const db = cf.env?.DB as D1Database | undefined

  if (!db) {
    return {
      ok: false,
      response: jsonError(missingDbMessage, 500),
    }
  }

  return {
    ok: true,
    env: cf.env as RouteDbEnv,
    db,
    ctx: cf.ctx,
  }
}

export async function ensureAuthenticatedRequest(
  req: NextRequest,
  db?: D1Database,
  unauthorizedMessage = 'Unauthorized',
) {
  if (!(await authenticateRequest(req, db))) {
    return jsonError(unauthorizedMessage, 401)
  }
  return null
}

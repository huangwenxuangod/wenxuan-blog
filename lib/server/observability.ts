import { NextResponse } from 'next/server'

type LogLevel = 'info' | 'warn' | 'error'

interface ServerLogOptions {
  requestId: string
  route: string
  method?: string
  context?: Record<string, unknown>
  error?: unknown
}

function sanitize(value: unknown, key = ''): unknown {
  const sensitiveKeys = new Set([
    'token',
    'apitoken',
    'authorization',
    'password',
    'content',
    'markdown',
    'cookie',
  ])
  if (sensitiveKeys.has(key.toLowerCase())) return '[REDACTED]'
  if (Array.isArray(value)) return value.slice(0, 20).map((item) => sanitize(item))
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .slice(0, 40)
        .map(([entryKey, entryValue]) => [entryKey, sanitize(entryValue, entryKey)]),
    )
  }
  if (typeof value === 'string' && value.length > 500) return `${value.slice(0, 500)}…`
  return value
}

function serializeError(error: unknown) {
  if (!error) return undefined
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
      stack: error.stack,
    }
  }
  return {
    name: 'UnknownError',
    message: String(error),
  }
}

export function createRequestId(req?: Request): string {
  const headers = req && typeof req === 'object' && 'headers' in req
    ? (req as { headers?: { get?: (name: string) => string | null } }).headers
    : undefined
  const incoming = headers?.get?.('x-request-id')?.trim()
  if (incoming && /^[a-zA-Z0-9._:-]{8,128}$/.test(incoming)) return incoming
  return typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`
}

export function logServerEvent(
  level: LogLevel,
  event: string,
  options: ServerLogOptions,
) {
  const entry = {
    timestamp: new Date().toISOString(),
    service: 'wenxuan-blog',
    level,
    event,
    requestId: options.requestId,
    route: options.route,
    method: options.method,
    context: options.context ? sanitize(options.context) : undefined,
    error: serializeError(options.error),
  }
  console[level](JSON.stringify(entry))
}

export function withRequestId<T extends Response>(response: T, requestId: string): T {
  response.headers.set('x-request-id', requestId)
  return response
}

export function serverErrorResponse(options: {
  requestId: string
  route: string
  method?: string
  code: string
  message: string
  status?: number
  hint?: string
  details?: string
  context?: Record<string, unknown>
  error?: unknown
}) {
  const status = options.status ?? 500
  logServerEvent(status >= 500 ? 'error' : 'warn', options.code, {
    requestId: options.requestId,
    route: options.route,
    method: options.method,
    context: {
      status,
      message: options.message,
      hint: options.hint,
      details: options.details,
      ...options.context,
    },
    error: options.error,
  })

  return NextResponse.json(
    {
      error: options.message,
    },
    {
      status,
      headers: {
        'x-request-id': options.requestId,
        'x-error-code': options.code,
        ...(options.hint ? { 'x-error-hint': options.hint } : {}),
      },
    },
  )
}

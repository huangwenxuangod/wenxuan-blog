import { describe, expect, it, vi } from 'vitest'
import {
  createRequestId,
  logServerEvent,
  serverErrorResponse,
  withRequestId,
} from '@/lib/server/observability'

describe('server observability', () => {
  it('preserves a valid incoming request id', () => {
    const request = new Request('https://example.com/api/posts', {
      headers: { 'x-request-id': 'clipper-request-1234' },
    })
    expect(createRequestId(request)).toBe('clipper-request-1234')
  })

  it('adds request id to responses', () => {
    const response = withRequestId(Response.json({ success: true }), 'request-1234')
    expect(response.headers.get('x-request-id')).toBe('request-1234')
  })

  it('preserves the legacy error body and exposes diagnostic headers', async () => {
    const response = serverErrorResponse({
      requestId: 'request-5678',
      route: '/api/posts',
      code: 'POST_CREATE_FAILED',
      message: '文章保存失败',
      details: 'database internals',
      error: new Error('database internals'),
    })

    expect(response.status).toBe(500)
    expect(response.headers.get('x-request-id')).toBe('request-5678')
    expect(response.headers.get('x-error-code')).toBe('POST_CREATE_FAILED')
    const body = await response.json()
    expect(body).toEqual({ error: '文章保存失败' })
  })

  it('redacts credentials from structured logs', () => {
    const spy = vi.spyOn(console, 'info').mockImplementation(() => undefined)
    logServerEvent('info', 'TEST_EVENT', {
      requestId: 'request-9999',
      route: '/api/test',
      context: {
        apiToken: 'secret',
        authorization: 'Bearer secret',
        safeValue: 'visible',
      },
    })

    const output = String(spy.mock.calls[0]?.[0])
    expect(output).not.toContain('Bearer secret')
    expect(output).not.toContain('"secret"')
    expect(output).toContain('[REDACTED]')
    expect(output).toContain('visible')
  })
})

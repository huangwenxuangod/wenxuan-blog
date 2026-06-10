import { NextRequest, NextResponse } from 'next/server'
import { authenticateRequest } from '@/lib/admin-auth'
import { getAppCloudflareEnv } from '@/lib/cloudflare'
import {
  clampMaxTokens,
  clampTemperature,
  decryptApiKey,
  ensureAiConfigInfrastructure,
  normalizeBaseUrl,
  resolveAiConfigSecret,
} from '@/lib/ai-provider-profiles'

const PROVIDER_TEST_TIMEOUT_MS = 45_000

function toStringSafe(value: unknown): string {
  if (typeof value === 'string') return value
  if (value === null || value === undefined) return ''
  return String(value)
}

function isTimeoutError(error: unknown): boolean {
  if (!error) return false

  if (error instanceof DOMException) {
    return error.name === 'TimeoutError' || error.name === 'AbortError'
  }

  if (error instanceof Error) {
    const message = error.message.toLowerCase()
    return (
      error.name === 'TimeoutError'
      || error.name === 'AbortError'
      || message.includes('timeout')
      || message.includes('aborted')
    )
  }

  return false
}

function buildProviderErrorMessage(resStatus: number, resStatusText: string, rawBody: string): string {
  let parsed: unknown
  try {
    parsed = rawBody ? JSON.parse(rawBody) : null
  } catch {
    parsed = null
  }

  if (parsed && typeof parsed === 'object') {
    const payload = parsed as {
      message?: unknown
      error?: unknown
    }

    if (payload.error && typeof payload.error === 'object') {
      const errObj = payload.error as {
        message?: unknown
        code?: unknown
        metadata?: {
          raw?: unknown
          provider_name?: unknown
          provider_error?: unknown
          reason?: unknown
        } | unknown
      }
      const message = toStringSafe(errObj.message)
      const code = toStringSafe(errObj.code)

      let providerRaw = ''
      let providerName = ''
      if (errObj.metadata && typeof errObj.metadata === 'object') {
        const meta = errObj.metadata as {
          raw?: unknown
          provider_name?: unknown
          provider_error?: unknown
          reason?: unknown
        }
        providerRaw =
          toStringSafe(meta.raw) ||
          toStringSafe(meta.provider_error) ||
          toStringSafe(meta.reason)
        providerName = toStringSafe(meta.provider_name)
      }

      const parts = [
        message || 'Provider returned error',
        providerRaw ? `详情: ${providerRaw}` : '',
        providerName ? `Provider: ${providerName}` : '',
        code ? `Code: ${code}` : '',
      ].filter(Boolean)
      return parts.join(' · ')
    }

    if (typeof payload.error === 'string' && payload.error.trim()) {
      return payload.error.trim()
    }

    if (typeof payload.message === 'string' && payload.message.trim()) {
      return payload.message.trim()
    }
  }

  const raw = rawBody.trim()
  if (raw) return raw.slice(0, 500)
  return `HTTP ${resStatus}: ${resStatusText}`
}

function normalizeProviderType(value: string) {
  if (value === 'anthropic') return 'anthropic'
  if (value === 'gemini') return 'legacy_gemini'
  return 'openai_compatible'
}

export async function POST(req: NextRequest) {
  const env = await getAppCloudflareEnv()
  const db = env?.DB as D1Database | undefined
  if (!(await authenticateRequest(req, db))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  if (!db) {
    return NextResponse.json({ error: 'DB unavailable' }, { status: 500 })
  }

  const secret = resolveAiConfigSecret(env as Record<string, unknown>)
  await ensureAiConfigInfrastructure(db, secret)

  const body = (await req.json()) as {
    profile_id?: number
    base_url?: string
    api_key?: string
    model?: string
    temperature?: number
    max_tokens?: number
    provider_type?: string
  }

  const profileId = Number(body.profile_id)
  let selectedProfile: {
    base_url: string
    model: string
    api_key_encrypted: string
    provider_type: string
  } | null = null

  if (Number.isFinite(profileId) && profileId > 0) {
    selectedProfile = await db.prepare(`
      SELECT base_url, model, api_key_encrypted, provider_type
      FROM ai_provider_profiles
      WHERE id = ?
      LIMIT 1
    `).bind(profileId).first<{
      base_url: string
      model: string
      api_key_encrypted: string
      provider_type: string
    }>()
  }

  const normalizedBaseUrl = normalizeBaseUrl(body.base_url || selectedProfile?.base_url || '')
  const normalizedModel = (body.model || selectedProfile?.model || '').trim()
  const providerType = normalizeProviderType((body.provider_type || selectedProfile?.provider_type || 'openai_compatible').trim())
  const temperature = clampTemperature(Number(body.temperature))
  const maxTokens = Math.max(1, Math.min(256, Math.floor(clampMaxTokens(Number(body.max_tokens)))))
  const testMaxTokens = Math.max(8, Math.min(16, maxTokens))

  const profileApiKey = selectedProfile?.api_key_encrypted
    ? await decryptApiKey(selectedProfile.api_key_encrypted, secret)
    : ''
  const storedKeyUnavailable = !((body.api_key || '').trim())
    && Boolean(selectedProfile?.api_key_encrypted?.trim())
    && !profileApiKey
  const key = (body.api_key || '').trim() || profileApiKey

  if (storedKeyUnavailable && normalizedBaseUrl && normalizedModel) {
    return NextResponse.json({
      success: false,
      error: '已保存 API Key 无法解密，请重新输入 API Key，或检查 AI_CONFIG_ENCRYPTION_SECRET / ADMIN_TOKEN_SALT 是否与保存时一致',
    })
  }

  if (!normalizedBaseUrl || !key || !normalizedModel) {
    return NextResponse.json({ error: '缺少必要参数' }, { status: 400 })
  }

  if (providerType === 'legacy_gemini') {
    return NextResponse.json({
      success: false,
      error: '检测到旧版 Gemini 配置。当前版本已不再兼容该接口，请改为 OpenAI 兼容接口或 Anthropic 接口。',
    })
  }

  try {
    const t0 = Date.now()
    const res = providerType === 'anthropic'
      ? await fetch(`${normalizedBaseUrl}/messages`, {
          method: 'POST',
          headers: {
            'x-api-key': key,
            'anthropic-version': '2023-06-01',
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model: normalizedModel,
            max_tokens: testMaxTokens,
            temperature,
            messages: [{ role: 'user', content: 'Reply with exactly: OK' }],
          }),
          signal: AbortSignal.timeout(PROVIDER_TEST_TIMEOUT_MS),
        })
      : await fetch(`${normalizedBaseUrl}/chat/completions`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${key}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model: normalizedModel,
            messages: [{ role: 'user', content: 'Reply with exactly: OK' }],
            temperature,
            max_tokens: testMaxTokens,
          }),
          signal: AbortSignal.timeout(PROVIDER_TEST_TIMEOUT_MS),
        })

    if (!res.ok) {
      const rawBody = await res.text().catch(() => '')
      const message = buildProviderErrorMessage(res.status, res.statusText, rawBody)
      return NextResponse.json({
        success: false,
        error: message,
      })
    }

    return NextResponse.json({
      success: true,
      latency_ms: Date.now() - t0,
      model: normalizedModel,
    })
  } catch (error) {
    if (isTimeoutError(error)) {
      return NextResponse.json({
        success: false,
        error: `测试请求超时：服务可访问，但在 ${Math.floor(PROVIDER_TEST_TIMEOUT_MS / 1000)} 秒内未返回结果。通常是模型冷启动、排队或接口响应较慢，不代表配置一定错误。`,
      })
    }

    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : '连接失败',
    })
  }
}

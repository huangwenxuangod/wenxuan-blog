import {
  clampMaxTokens,
  clampTemperature,
  decryptApiKey,
  ensureAiConfigInfrastructure,
  resolveAiConfigSecret,
  normalizeBaseUrl,
  isWorkersAiBaseUrl,
} from '@/lib/ai-provider-profiles'

const DEFAULT_EXTERNAL_BASE_URL = 'https://api.deepseek.com/v1'
const DEFAULT_EXTERNAL_MODEL = 'deepseek-chat'
const DEFAULT_WORKERS_AI_MODEL = '@cf/meta/llama-3.1-8b-instruct'

export interface AIEnv {
  AI_API_KEY?: string
  AI_BASE_URL?: string
  AI_MODEL?: string
  WORKERS_AI?: WorkersAIBinding
  WORKERS_AI_MODEL?: string
  ENABLE_WORKERS_AI?: string
  AI_CONFIG_ENCRYPTION_SECRET?: string
  ADMIN_TOKEN_SALT?: string
}

function resolveProviderType(value: unknown): 'openai_compatible' | 'anthropic' | 'legacy_gemini' {
  if (value === 'anthropic') return 'anthropic'
  if (value === 'gemini') return 'legacy_gemini'
  return 'openai_compatible'
}

export type ResolvedConfig =
  | {
      strategy: 'external-provider'
      apiKey: string
      providerType: 'openai_compatible' | 'anthropic'
      baseURL: string
      model: string
      temperature: number
      maxTokens: number
    }
  | {
      strategy: 'workers-ai'
      binding: WorkersAIBinding
      model: string
      temperature: number
      maxTokens: number
    }
  | {
      strategy: 'disabled'
      reason: string
      model: string
      temperature: number
      maxTokens: number
    }

function readFlag(value: unknown): boolean {
  return typeof value === 'string' && ['1', 'true', 'yes', 'on'].includes(value.trim().toLowerCase())
}

function resolveWorkersAiModel(env?: AIEnv): string {
  return (env?.WORKERS_AI_MODEL || env?.AI_MODEL || DEFAULT_WORKERS_AI_MODEL).trim() || DEFAULT_WORKERS_AI_MODEL
}

function getDisabledConfig(reason: string): ResolvedConfig {
  return {
    strategy: 'disabled',
    reason,
    model: '',
    temperature: 0.7,
    maxTokens: 2000,
  }
}

function resolveEnv(env?: AIEnv): ResolvedConfig {
  const externalApiKey = env?.AI_API_KEY || process.env.AI_API_KEY || ''

  if (env?.WORKERS_AI && readFlag(env?.ENABLE_WORKERS_AI || process.env.ENABLE_WORKERS_AI)) {
    return {
      strategy: 'workers-ai',
      binding: env.WORKERS_AI,
      model: resolveWorkersAiModel(env),
      temperature: 0.7,
      maxTokens: 2000,
    }
  }

  if (externalApiKey) {
    return {
      strategy: 'external-provider',
      apiKey: externalApiKey,
      providerType: 'openai_compatible',
      baseURL: env?.AI_BASE_URL || process.env.AI_BASE_URL || DEFAULT_EXTERNAL_BASE_URL,
      model: env?.AI_MODEL || process.env.AI_MODEL || DEFAULT_EXTERNAL_MODEL,
      temperature: 0.7,
      maxTokens: 2000,
    }
  }

  return getDisabledConfig('当前部署未配置 AI 供应商。可配置外部 API Key，或开启 Workers AI。')
}

export function getAiRuntimeEnv(env?: Partial<CloudflareEnv> | null): AIEnv {
  return {
    AI_API_KEY: (env as Record<string, string | undefined> | null | undefined)?.AI_API_KEY || process.env.AI_API_KEY,
    AI_BASE_URL: (env as Record<string, string | undefined> | null | undefined)?.AI_BASE_URL || process.env.AI_BASE_URL,
    AI_MODEL: (env as Record<string, string | undefined> | null | undefined)?.AI_MODEL || process.env.AI_MODEL,
    WORKERS_AI: env?.WORKERS_AI,
    WORKERS_AI_MODEL:
      (env as Record<string, string | undefined> | null | undefined)?.WORKERS_AI_MODEL ||
      process.env.WORKERS_AI_MODEL,
    ENABLE_WORKERS_AI:
      (env as Record<string, string | undefined> | null | undefined)?.ENABLE_WORKERS_AI ||
      process.env.ENABLE_WORKERS_AI,
    AI_CONFIG_ENCRYPTION_SECRET:
      (env as Record<string, string | undefined> | null | undefined)?.AI_CONFIG_ENCRYPTION_SECRET ||
      process.env.AI_CONFIG_ENCRYPTION_SECRET,
    ADMIN_TOKEN_SALT:
      (env as Record<string, string | undefined> | null | undefined)?.ADMIN_TOKEN_SALT ||
      process.env.ADMIN_TOKEN_SALT,
  }
}

export async function resolveConfig(env?: AIEnv, db?: D1Database, profileId?: number): Promise<ResolvedConfig> {
  if (db) {
    try {
      const secret = resolveAiConfigSecret(env as Record<string, unknown> | undefined)
      await ensureAiConfigInfrastructure(db, secret)

      const selected = Number.isFinite(profileId) && Number(profileId) > 0
        ? await db.prepare(`
            SELECT base_url, model, temperature, max_tokens, api_key_encrypted, provider_type
            FROM ai_provider_profiles
            WHERE id = ?
            LIMIT 1
          `).bind(Number(profileId)).first<{
            base_url: string
            model: string
            temperature: number
            max_tokens: number
            api_key_encrypted: string
            provider_type: string
          }>()
        : await db.prepare(`
            SELECT base_url, model, temperature, max_tokens, api_key_encrypted, provider_type
            FROM ai_provider_profiles
            ORDER BY is_default DESC, id ASC
            LIMIT 1
          `).first<{
            base_url: string
            model: string
            temperature: number
            max_tokens: number
            api_key_encrypted: string
            provider_type: string
          }>()

      if (selected?.base_url && selected.model) {
        const key = await decryptApiKey(selected.api_key_encrypted || '', secret)
        if (key) {
          const providerType = resolveProviderType(selected.provider_type)
          if (providerType === 'legacy_gemini') {
            return getDisabledConfig('检测到旧版 Gemini 配置。当前版本已不再兼容该接口，请在后台重新配置为 OpenAI 兼容接口或 Anthropic 接口。')
          }
          return {
            strategy: 'external-provider',
            apiKey: key,
            providerType,
            baseURL: normalizeBaseUrl(selected.base_url),
            model: selected.model,
            temperature: clampTemperature(Number(selected.temperature)),
            maxTokens: clampMaxTokens(Number(selected.max_tokens)),
          }
        }
      }

      const [providerRow, keyRow] = await Promise.all([
        db.prepare("SELECT value FROM site_settings WHERE key = 'ai_provider_config'").first<{ value: string }>(),
        db.prepare("SELECT value FROM site_settings WHERE key = 'ai_provider_api_key'").first<{ value: string }>(),
      ])

      if (providerRow?.value && keyRow?.value) {
        const cfg = JSON.parse(providerRow.value) as {
          provider_type?: string
          base_url?: string
          model?: string
          temperature?: number
          max_tokens?: number
        }

        if (cfg.base_url && cfg.model) {
          const providerType = resolveProviderType(cfg.provider_type)
          if (providerType === 'legacy_gemini') {
            return getDisabledConfig('检测到旧版 Gemini 配置。当前版本已不再兼容该接口，请在后台重新配置为 OpenAI 兼容接口或 Anthropic 接口。')
          }
          return {
            strategy: 'external-provider',
            apiKey: keyRow.value,
            providerType,
            baseURL: normalizeBaseUrl(cfg.base_url),
            model: cfg.model,
            temperature: clampTemperature(Number(cfg.temperature)),
            maxTokens: clampMaxTokens(Number(cfg.max_tokens)),
          }
        }
      }
    } catch {
      // DB 读取失败，降级到环境变量
    }
  }

  return resolveEnv(env)
}

export { isWorkersAiBaseUrl, normalizeBaseUrl }

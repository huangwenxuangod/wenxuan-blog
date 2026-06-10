import { describe, expect, it } from 'vitest'
import { resolveConfig } from '@/lib/ai-runtime'

describe('AI runtime config resolution', () => {
  it('prefers explicitly enabled Workers AI over a legacy external API key', async () => {
    const binding = { run: async () => ({}) } as unknown as WorkersAIBinding

    const config = await resolveConfig({
      AI_API_KEY: 'legacy-key',
      AI_BASE_URL: 'https://api.openai.com/v1',
      AI_MODEL: 'gpt-4o-mini',
      WORKERS_AI: binding,
      WORKERS_AI_MODEL: '@cf/meta/llama-3.1-8b-instruct',
      ENABLE_WORKERS_AI: 'true',
    })

    expect(config).toMatchObject({
      strategy: 'workers-ai',
      binding,
      model: '@cf/meta/llama-3.1-8b-instruct',
    })
  })

  it('uses the external provider when Workers AI is not enabled', async () => {
    const config = await resolveConfig({
      AI_API_KEY: 'external-key',
      AI_BASE_URL: 'https://api.example.com/v1',
      AI_MODEL: 'example-model',
      ENABLE_WORKERS_AI: 'false',
    })

    expect(config).toMatchObject({
      strategy: 'external-provider',
      apiKey: 'external-key',
      baseURL: 'https://api.example.com/v1',
      model: 'example-model',
    })
  })

  it('disables legacy gemini profiles loaded from db config', async () => {
    const config = await resolveConfig(
      {
        AI_CONFIG_ENCRYPTION_SECRET: 'test-secret',
      },
      {
        prepare: (sql: string) => {
          if (sql.includes('CREATE TABLE')) {
            return { run: async () => ({}) }
          }
          if (sql.includes('PRAGMA table_info(ai_actions)')) {
            return { all: async () => ({ results: [{ name: 'profile_id' }] }) }
          }
          if (sql.includes('SELECT COUNT(*) as count FROM ai_actions')) {
            return { first: async () => ({ count: 1 }) }
          }
          if (sql.includes('SELECT COUNT(*) as count FROM ai_provider_profiles')) {
            return { first: async () => ({ count: 1 }) }
          }
          if (sql.includes('SELECT base_url, model, temperature, max_tokens, api_key_encrypted, provider_type')) {
            return {
              first: async () => ({
                base_url: 'https://generativelanguage.googleapis.com/v1beta',
                model: 'gemini-1.5-flash',
                temperature: 0.7,
                max_tokens: 1000,
                api_key_encrypted: 'plain-test-key',
                provider_type: 'gemini',
              }),
              bind: () => ({
                first: async () => ({
                  base_url: 'https://generativelanguage.googleapis.com/v1beta',
                  model: 'gemini-1.5-flash',
                  temperature: 0.7,
                  max_tokens: 1000,
                  api_key_encrypted: 'plain-test-key',
                  provider_type: 'gemini',
                }),
              }),
            }
          }
          if (sql.includes("SELECT value FROM site_settings WHERE key = 'ai_provider_config'")) {
            return { first: async () => null }
          }
          if (sql.includes("SELECT value FROM site_settings WHERE key = 'ai_provider_api_key'")) {
            return { first: async () => null }
          }
          if (sql.includes('SELECT id FROM ai_provider_profiles WHERE is_default = 1')) {
            return { first: async () => ({ id: 1 }) }
          }
          return {
            first: async () => null,
            all: async () => ({ results: [] }),
            run: async () => ({}),
            bind: () => ({
              first: async () => null,
            }),
          }
        },
      } as unknown as D1Database,
    )

    expect(config).toMatchObject({
      strategy: 'disabled',
      reason: expect.stringContaining('旧版 Gemini 配置'),
    })
  })
})

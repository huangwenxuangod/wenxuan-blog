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
})

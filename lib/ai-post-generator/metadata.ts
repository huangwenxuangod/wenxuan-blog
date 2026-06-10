import { getAiRuntimeEnv } from '@/lib/ai'
import {
  clampMaxTokens,
  clampTemperature,
  resolveAiConfigSecret,
  resolveAiProfileConfig,
} from '@/lib/ai-provider-profiles'
import {
  DEFAULT_TEXT_WORKERS_MODEL,
} from '@/lib/ai-post-generator/constants'
import {
  buildPlainRetryInstruction,
  buildFallbackSummary,
  extractGeneratedText,
  getWorkersAiAssistantPayload,
  extractWorkersAiText,
  normalizeSummary,
  parseJsonValue,
  shouldRetryAssistantPayload,
} from '@/lib/ai-post-generator/parsers'
import {
  resolveGeneratedSlug,
  resolveGeneratedTags,
} from '@/lib/ai-post-generator/metadata-fallbacks'
import {
  buildContextBlock,
  buildTextSystemPrompt,
} from '@/lib/ai-post-generator/prompts'
import { buildTextGenerationRequestOptions } from '@/lib/ai-post-generator/request-options'
import { getAiPostGeneratorByTarget } from '@/lib/ai-post-generator/storage'
import type {
  AiPostGeneratorRow,
  AiPostGeneratorTarget,
  GeneratePostMetadataInput,
} from '@/lib/ai-post-generator/types'
import { resolveWorkersAiProfile } from '@/lib/ai-post-generator/workers-profile'
import {
  buildPostMetadataResponseSchema,
  buildWorkersAiJsonSchemaResponseFormat,
} from '@/lib/workers-ai-json'
import { runExternalTextRequest } from '@/lib/ai-runtime/external-text'

type TextRuntime =
  | {
      strategy: 'workers-ai'
      binding: WorkersAIBinding
      model: string
      temperature: number
      maxTokens: number
    }
  | {
      strategy: 'external-provider'
      apiKey: string
      providerType: 'openai_compatible' | 'anthropic'
      baseURL: string
      model: string
      temperature: number
      maxTokens: number
    }

function readFlag(value: unknown): boolean {
  return typeof value === 'string' && ['1', 'true', 'yes', 'on'].includes(value.trim().toLowerCase())
}

async function runTextGenerator(
  config: TextRuntime,
  messages: Array<{ role: 'system' | 'user'; content: string }>,
  target: Exclude<AiPostGeneratorTarget, 'cover'>,
): Promise<{ text: string; reasoningText: string }> {
  const retryMessages = messages.map((message, index) => (
    index === 0 && message.role === 'system'
      ? {
          ...message,
          content: `${message.content}\n\nDo not output reasoning, thinking, or analysis. Return only the final answer.\n${buildPlainRetryInstruction(target)}`,
        }
      : message
  ))

  if (config.strategy === 'workers-ai') {
    const requestOptions = buildTextGenerationRequestOptions({
      strategy: 'workers-ai',
      model: config.model,
    })
    const result = await config.binding.run(config.model, {
      messages,
      max_tokens: config.maxTokens,
      temperature: config.temperature,
      response_format: buildWorkersAiJsonSchemaResponseFormat(
        buildPostMetadataResponseSchema(target),
      ),
      ...requestOptions,
    })
    const primary = getWorkersAiAssistantPayload(result)
    if (primary.content) {
      return {
        text: primary.content,
        reasoningText: primary.reasoning,
      }
    }

    if (shouldRetryAssistantPayload(primary)) {
      const retry = await config.binding.run(config.model, {
        messages: retryMessages,
        max_tokens: Math.min(Math.max(config.maxTokens * 3, 512), 2048),
        temperature: config.temperature,
      })
      const retryPayload = getWorkersAiAssistantPayload(retry)
      if (retryPayload.content) {
        return {
          text: retryPayload.content,
          reasoningText: retryPayload.reasoning || primary.reasoning,
        }
      }

      return {
        text: extractWorkersAiText(retry),
        reasoningText: retryPayload.reasoning || primary.reasoning,
      }
    }

    return {
      text: extractWorkersAiText(result),
      reasoningText: primary.reasoning,
    }
  }

  const requestOptions = buildTextGenerationRequestOptions({
    strategy: 'external-provider',
    baseURL: config.baseURL,
    model: config.model,
  })

  const primary = await runExternalTextRequest({
    config,
    messages,
    temperature: config.temperature,
    maxTokens: config.maxTokens,
    jsonMode: config.providerType !== 'anthropic',
    requestOptions,
    timeoutMs: 30000,
  })
  if (primary.content) {
    return {
      text: primary.content,
      reasoningText: primary.reasoning,
    }
  }

  if (primary.reasoning || primary.finishReason === 'length') {
    const retryPayload = await runExternalTextRequest({
      config,
      messages: retryMessages,
      temperature: config.temperature,
      maxTokens: Math.min(Math.max(config.maxTokens * 3, 512), 2048),
      requestOptions,
      timeoutMs: 30000,
    })
    if (retryPayload.content) {
      return {
        text: retryPayload.content,
        reasoningText: retryPayload.reasoning || primary.reasoning,
      }
    }

    return {
      text: '',
      reasoningText: retryPayload.reasoning || primary.reasoning,
    }
  }

  return {
    text: '',
    reasoningText: primary.reasoning,
  }
}

async function resolveTextRuntime(
  generator: AiPostGeneratorRow,
  env?: Partial<CloudflareEnv> | null,
  db?: D1Database,
): Promise<TextRuntime> {
  const aiEnv = getAiRuntimeEnv(env)
  if (generator.provider_mode === 'workers_ai') {
    if (env?.WORKERS_AI && readFlag(aiEnv.ENABLE_WORKERS_AI)) {
      return {
        strategy: 'workers-ai',
        binding: env.WORKERS_AI,
        model: generator.workers_model || aiEnv.WORKERS_AI_MODEL || DEFAULT_TEXT_WORKERS_MODEL,
        temperature: clampTemperature(generator.temperature),
        maxTokens: clampMaxTokens(generator.max_tokens),
      }
    }

    if (db) {
      const secret = resolveAiConfigSecret(env as Record<string, unknown> | undefined)
      const selectedWorkersProfile = await resolveWorkersAiProfile(
        db,
        secret,
        Number.isFinite(generator.text_profile_id) ? Number(generator.text_profile_id) : undefined,
      )

      if (selectedWorkersProfile) {
        return {
          strategy: 'external-provider',
          apiKey: selectedWorkersProfile.api_key,
          providerType: selectedWorkersProfile.provider_type === 'anthropic' ? 'anthropic' : 'openai_compatible',
          baseURL: selectedWorkersProfile.base_url,
          model: generator.workers_model || selectedWorkersProfile.model || DEFAULT_TEXT_WORKERS_MODEL,
          temperature: clampTemperature(generator.temperature),
          maxTokens: clampMaxTokens(generator.max_tokens),
        }
      }
    }

    throw new Error('当前部署未启用 Workers AI binding，且未找到可用的 Workers AI provider profile')
  }

  if (!db) {
    throw new Error('文本模型配置缺少数据库上下文')
  }

  const secret = resolveAiConfigSecret(env as Record<string, unknown> | undefined)
  const profile = await resolveAiProfileConfig(
    db,
    secret,
    Number.isFinite(generator.text_profile_id) ? Number(generator.text_profile_id) : undefined,
  )

  if (!profile) {
    throw new Error('请先在后台配置可用的文本模型')
  }

  return {
    strategy: 'external-provider',
    apiKey: profile.api_key,
    providerType: profile.provider_type === 'anthropic' ? 'anthropic' : 'openai_compatible',
    baseURL: profile.base_url,
    model: profile.model,
    temperature: clampTemperature(generator.temperature || profile.temperature),
    maxTokens: clampMaxTokens(generator.max_tokens || profile.max_tokens),
  }
}

export async function generatePostMetadata(
  input: GeneratePostMetadataInput,
) {
  const generator = await getAiPostGeneratorByTarget(input.db, input.target, input.env)
  if (!generator || generator.is_enabled !== 1) {
    throw new Error('当前字段未启用 AI 生成')
  }

  const fallbackSummary = buildFallbackSummary(input.title || '', input.content || '')
  const runtime = await resolveTextRuntime(generator, input.env, input.db)
  const contextBlock = buildContextBlock(input, input.target)
  const generation = await runTextGenerator(runtime, [
    {
      role: 'system',
      content: buildTextSystemPrompt(input.target, generator.prompt),
    },
    {
      role: 'user',
      content: contextBlock,
    },
  ], input.target)
  const resultText = generation.text

  const parsed = parseJsonValue(resultText)

  if (input.target === 'summary') {
    return {
      target: input.target,
      value: normalizeSummary(
        extractGeneratedText(parsed, resultText, ['summary', 'description', 'text', 'content', 'result']),
        fallbackSummary,
      ),
      generator,
    }
  }

  if (input.target === 'tags') {
    return {
      target: input.target,
      value: resolveGeneratedTags({
        title: input.title,
        content: input.content,
        category: input.category,
        description: input.description,
        tags: input.tags,
        currentSlug: input.currentSlug,
        resultText,
        reasoningText: generation.reasoningText,
      }),
      generator,
    }
  }

  return {
    target: input.target,
    value: resolveGeneratedSlug({
      title: input.title,
      content: input.content,
      category: input.category,
      description: input.description,
      tags: input.tags,
      currentSlug: input.currentSlug,
      resultText,
      reasoningText: generation.reasoningText,
    }),
    generator,
  }
}

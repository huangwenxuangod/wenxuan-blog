import type OpenAI from 'openai'
import type { ImagesResponse } from 'openai/resources/images'
import {
  ensureAiImageConfigInfrastructure,
  getDefaultImageActionSeed,
  resolveAiImageProfileConfig,
} from './config'
import {
  normalizeAiImageAspectRatio,
  normalizeAiImageResolution,
} from './options'
import {
  isWorkersAiBaseUrl,
  normalizeBaseUrl,
  resolveAiConfigSecret,
} from '@/lib/ai-provider-profiles'
import {
  extractWorkersAiImageAsset,
  resolveWorkersAiImageSize,
  runWorkersAiCompatImageRequest,
} from './workers'
import {
  inferExtensionFromContentType,
  toBytesFromBase64,
  toUint8Array,
  type AIImageEnv,
  type GeneratedEditorImage,
  type ImageBucket,
} from './shared'
import {
  buildFinalImagePrompt,
  resolveRequestedQuality,
  resolveRequestedSize,
} from './prompt'
import { resolveImageAction } from './actions'
import { persistGeneratedEditorImage } from './delivery'

export type {
  AIImageEnv,
  GeneratedEditorImage,
  ImageBucket,
} from './shared'
export {
  extractWorkersAiImageAsset,
  resolveWorkersAiImageSize,
  runWorkersAiCompatImageRequest,
}

interface GenerateEditorImageInput {
  action: string
  actionPrompt?: string
  actionLabel?: string
  userPrompt?: string
  articleTitle?: string
  contextText?: string
  referenceImageUrl?: string
  aspectRatio?: string
  resolution?: string
  profileId?: number | null
  db: D1Database
  env?: AIImageEnv
  images: ImageBucket
}

function sanitizeFilename(filename: string) {
  const trimmed = filename.trim().toLowerCase()
  const safe = trimmed.replace(/[^a-z0-9._-]+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '')
  return safe || 'image'
}

async function runGenerateWithFallback(
  client: OpenAI,
  config: {
    apiKey: string
    baseURL: string
    providerType?: string
  },
  params: {
    model: string
    prompt: string
    size: string
    quality: string
  },
): Promise<ImagesResponse> {
  const attempts: Array<Record<string, unknown>> = [
    {
      model: params.model,
      prompt: params.prompt,
      n: 1,
      size: params.size,
      quality: params.quality,
      output_format: 'webp',
      background: 'auto',
    },
    {
      model: params.model,
      prompt: params.prompt,
      n: 1,
      size: params.size,
      quality: params.quality,
    },
    {
      model: params.model,
      prompt: params.prompt,
      n: 1,
      size: params.size,
    },
    {
      model: params.model,
      prompt: params.prompt,
      n: 1,
    },
  ]

  let lastError: Error | null = null

  for (const body of attempts) {
    try {
      return await client.images.generate(body as never) as ImagesResponse
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error))
    }
  }

  if (shouldRetryWithMultipartFallback(lastError, config.providerType)) {
    return runGenerateMultipartFallback(config, params, lastError)
  }

  throw lastError || new Error('图片生成失败')
}

async function runEditWithFallback(
  client: OpenAI,
  params: {
    image: File | Array<File>
    inputFidelity?: 'high' | 'low'
    model: string
    prompt: string
    quality: string
    size: string
  },
) {
  const attempts: Array<Record<string, unknown>> = [
    {
      model: params.model,
      prompt: params.prompt,
      image: params.image,
      size: params.size,
      quality: params.quality,
      input_fidelity: params.inputFidelity ?? 'high',
      output_format: 'webp',
      background: 'auto',
    },
    {
      model: params.model,
      prompt: params.prompt,
      image: params.image,
      size: params.size,
      quality: params.quality,
      output_format: 'webp',
      background: 'auto',
    },
    {
      model: params.model,
      prompt: params.prompt,
      image: params.image,
      size: params.size,
      quality: params.quality,
    },
    {
      model: params.model,
      prompt: params.prompt,
      image: params.image,
      size: params.size,
    },
    {
      model: params.model,
      prompt: params.prompt,
      image: params.image,
    },
  ]

  let lastError: Error | null = null

  for (const body of attempts) {
    try {
      return await client.images.edit(body as never) as ImagesResponse
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error))
    }
  }

  throw lastError || new Error('参考图生成失败')
}

function parseOpenAiCompatImageErrorMessage(
  resStatus: number,
  resStatusText: string,
  rawBody: string,
) {
  try {
    if (rawBody) {
      const parsed = JSON.parse(rawBody) as {
        errors?: Array<{ message?: string }>
        error?: { message?: string } | string
        message?: string
      }

      const firstError = parsed.errors?.find((item) => typeof item?.message === 'string' && item.message.trim())
      if (firstError?.message) {
        return firstError.message.trim()
      }

      if (typeof parsed.error === 'object' && parsed.error?.message) {
        return parsed.error.message.trim()
      }

      if (typeof parsed.error === 'string' && parsed.error.trim()) {
        return parsed.error.trim()
      }

      if (typeof parsed.message === 'string' && parsed.message.trim()) {
        return parsed.message.trim()
      }
    }
  } catch {
    // ignore parse error
  }

  const fallbackRaw = rawBody.trim()
  if (fallbackRaw) return fallbackRaw.slice(0, 500)
  return `HTTP ${resStatus}: ${resStatusText}`
}

function shouldRetryWithMultipartFallback(error: Error | null, providerType?: string) {
  if ((providerType || '').trim() === 'openai_images') return true
  if (!error) return false

  const normalized = error.message.toLowerCase()
  return normalized.includes('multipart')
    || normalized.includes('form-data')
    || normalized.includes("required properties at '/' are 'multipart'")
}

async function runGenerateMultipartFallback(
  config: {
    apiKey: string
    baseURL: string
  },
  params: {
    model: string
    prompt: string
    size: string
    quality: string
  },
  previousError: Error | null,
) {
  const endpoint = `${normalizeBaseUrl(config.baseURL)}/images/generations`
  const attempts: Array<Record<string, string>> = [
    {
      model: params.model,
      prompt: params.prompt,
      n: '1',
      size: params.size,
      quality: params.quality,
      response_format: 'b64_json',
      output_format: 'webp',
      background: 'auto',
    },
    {
      model: params.model,
      prompt: params.prompt,
      n: '1',
      size: params.size,
      quality: params.quality,
      response_format: 'b64_json',
    },
    {
      model: params.model,
      prompt: params.prompt,
      n: '1',
      size: params.size,
      quality: params.quality,
    },
    {
      model: params.model,
      prompt: params.prompt,
      n: '1',
      size: params.size,
    },
    {
      model: params.model,
      prompt: params.prompt,
      n: '1',
    },
  ]

  let lastError = previousError

  for (const fields of attempts) {
    const formData = new FormData()
    for (const [key, value] of Object.entries(fields)) {
      if (value.trim()) {
        formData.append(key, value)
      }
    }

    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${config.apiKey}`,
        },
        body: formData,
        signal: AbortSignal.timeout(120000),
      })

      const rawBody = await response.text().catch(() => '')
      if (!response.ok) {
        throw new Error(parseOpenAiCompatImageErrorMessage(response.status, response.statusText, rawBody))
      }

      const parsed = rawBody ? JSON.parse(rawBody) : null
      if (!parsed || !Array.isArray(parsed.data) || parsed.data.length === 0) {
        throw new Error('图片接口未返回结果')
      }

      return parsed as ImagesResponse
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error))
    }
  }

  throw lastError || new Error('图片生成失败')
}

async function extractGeneratedImagePayload(
  response: ImagesResponse,
): Promise<{
  bytes: Uint8Array
  contentType: string
  extension: string
  revisedPrompt: string
}> {
  const payload = response.data?.[0]
  if (!payload) {
    throw new Error('图片接口未返回结果')
  }

  if (payload.b64_json) {
    const bytes = toBytesFromBase64(payload.b64_json)
    if (bytes.length === 0) {
      throw new Error('图片数据为空')
    }
    return {
      bytes,
      contentType: 'image/webp',
      extension: 'webp',
      revisedPrompt: (payload.revised_prompt || '').trim(),
    }
  }

  if (payload.url) {
    const res = await fetch(payload.url, { signal: AbortSignal.timeout(30000) })
    if (!res.ok) {
      throw new Error(`拉取生成图片失败：HTTP ${res.status}`)
    }
    const bytes = new Uint8Array(await res.arrayBuffer())
    const contentType = res.headers.get('content-type') || 'image/png'
    const extension = contentType.includes('webp')
      ? 'webp'
      : contentType.includes('jpeg')
        ? 'jpg'
        : 'png'

    return {
      bytes,
      contentType,
      extension,
      revisedPrompt: (payload.revised_prompt || '').trim(),
    }
  }

  throw new Error('图片接口未返回可用内容')
}

async function fetchReferenceImageFile(referenceImageUrl: string) {
  const response = await fetch(referenceImageUrl, {
    signal: AbortSignal.timeout(30000),
  })

  if (!response.ok) {
    throw new Error('参考图读取失败')
  }

  const blob = await response.blob()
  const urlFileName = referenceImageUrl.split('/').pop()?.split('?')[0]?.split('#')[0] || 'reference-image'
  const extension = inferExtensionFromContentType(blob.type)
  const baseName = sanitizeFilename(urlFileName.replace(/\.[^.]+$/, '') || 'reference-image')

  return new File([blob], `${baseName}.${extension}`, {
    type: blob.type || `image/${extension}`,
    lastModified: Date.now(),
  })
}

export async function generateEditorImage(
  input: GenerateEditorImageInput,
): Promise<GeneratedEditorImage> {
  await ensureAiImageConfigInfrastructure(input.db)

  const secret = resolveAiConfigSecret(input.env as Record<string, unknown> | undefined)
  const action = await resolveImageAction(input.db, input.action)
  const seeded = getDefaultImageActionSeed(action?.action_key)
  const requestedAspectRatio = normalizeAiImageAspectRatio(
    input.aspectRatio || action?.aspect_ratio || seeded?.aspect_ratio,
  )
  const requestedResolution = normalizeAiImageResolution(
    input.resolution || action?.resolution || seeded?.resolution,
  )
  const selectedProfileId = Number.isFinite(input.profileId) && Number(input.profileId) > 0
    ? Number(input.profileId)
    : action?.profile_id ?? undefined
  const profile = await resolveAiImageProfileConfig(input.db, secret, selectedProfileId)

  if (!profile) {
    throw new Error('请先在后台配置图片模型')
  }

  const finalPrompt = buildFinalImagePrompt(
    input.actionPrompt || action?.prompt,
    input.userPrompt,
    input.articleTitle,
    input.contextText,
    requestedAspectRatio,
    requestedResolution,
  )
  const hasReferenceImage = typeof input.referenceImageUrl === 'string' && input.referenceImageUrl.trim().length > 0

  const imagePayload = profile.provider === 'workers_ai' || isWorkersAiBaseUrl(profile.base_url)
    ? await (async () => {
        if (hasReferenceImage) {
          throw new Error('当前图片模型通道暂不支持参考图生成，请切换到 OpenAI 兼容图片模型')
        }

        const { width, height } = resolveWorkersAiImageSize(requestedAspectRatio, requestedResolution)
        const rawResult = await runWorkersAiCompatImageRequest(
          {
            apiKey: profile.api_key,
            baseURL: profile.base_url,
            model: profile.model,
          },
          {
            prompt: finalPrompt,
            width,
            height,
          },
        )
        const asset = await extractWorkersAiImageAsset(rawResult, profile.model)
        return {
          bytes: await toUint8Array(asset.data),
          contentType: asset.contentType,
          extension: asset.extension,
          revisedPrompt: finalPrompt,
        }
      })()
    : await (async () => {
        const { default: OpenAI } = await import('openai')
        const client = new OpenAI({
          apiKey: profile.api_key,
          baseURL: normalizeBaseUrl(profile.base_url),
        })

        const size = resolveRequestedSize(requestedAspectRatio, action?.size || seeded?.size)
        const quality = resolveRequestedQuality(requestedResolution, action?.quality || seeded?.quality)

        const response = hasReferenceImage
          ? await runEditWithFallback(
              client,
              {
                image: await fetchReferenceImageFile(String(input.referenceImageUrl).trim()),
                inputFidelity: 'high',
                model: profile.model,
                prompt: finalPrompt,
                size,
                quality,
              },
            )
          : await runGenerateWithFallback(
              client,
              {
                apiKey: profile.api_key,
                baseURL: profile.base_url,
                providerType: profile.provider_type,
              },
              {
                model: profile.model,
                prompt: finalPrompt,
                size,
                quality,
              },
            )

        return extractGeneratedImagePayload(response)
      })()
  const persisted = await persistGeneratedEditorImage({
    images: input.images,
    env: input.env,
    bytes: imagePayload.bytes,
    contentType: imagePayload.contentType,
    extension: imagePayload.extension,
    revisedPrompt: imagePayload.revisedPrompt,
    userPrompt: input.userPrompt,
    articleTitle: input.articleTitle,
    actionLabel: input.actionLabel || action?.label || '自定义生成',
    size: resolveRequestedSize(requestedAspectRatio, action?.size || seeded?.size),
    aspectRatio: requestedAspectRatio,
    resolution: requestedResolution,
    profileName: profile.name,
    model: profile.model,
  })

  return {
    ...persisted,
    prompt: finalPrompt,
  }
}

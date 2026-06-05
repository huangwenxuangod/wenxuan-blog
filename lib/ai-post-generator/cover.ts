import { nanoid } from 'nanoid'
import { resolveAiImageProfileConfig } from '@/lib/ai-image/config'
import {
  extractWorkersAiImageAsset,
  resolveWorkersAiImageSize,
  runWorkersAiCompatImageRequest,
} from '@/lib/ai-image/workers'
import {
  resolveAiConfigSecret,
} from '@/lib/ai-provider-profiles'
import {
  DEFAULT_IMAGE_WORKERS_MODEL,
} from '@/lib/ai-post-generator/constants'
import {
  buildAssetUrls,
  buildCoverPrompt,
  getNowPrefix,
  sanitizeFilename,
} from '@/lib/ai-post-generator/prompts'
import { getAiPostGeneratorByTarget } from '@/lib/ai-post-generator/storage'
import type {
  GeneratePostCoverInput,
  GeneratedPostCoverResult,
} from '@/lib/ai-post-generator/types'
import { resolveWorkersAiProfile } from '@/lib/ai-post-generator/workers-profile'

function readFlag(value: unknown): boolean {
  return typeof value === 'string' && ['1', 'true', 'yes', 'on'].includes(value.trim().toLowerCase())
}

async function generateWorkersAiCover(
  input: GeneratePostCoverInput,
  generator: Awaited<ReturnType<typeof getAiPostGeneratorByTarget>>,
) {
  if (!generator) {
    throw new Error('当前封面生成功能未启用')
  }

  const prompt = buildCoverPrompt(generator, input)
  const { width, height } = resolveWorkersAiImageSize(generator.aspect_ratio, generator.resolution)

  let rawResult: unknown
  let model = generator.workers_model || DEFAULT_IMAGE_WORKERS_MODEL

  if (input.env?.WORKERS_AI && readFlag(input.env.ENABLE_WORKERS_AI)) {
    rawResult = await input.env.WORKERS_AI.run(model, {
      prompt,
      width,
      height,
    })
  } else {
    const secret = resolveAiConfigSecret(input.env as Record<string, unknown> | undefined)
    const selectedWorkersProfile = await resolveWorkersAiProfile(input.db, secret)

    if (!selectedWorkersProfile) {
      throw new Error('当前部署未启用 Workers AI binding，且未找到可用的 Workers AI provider profile')
    }

    model = generator.workers_model || selectedWorkersProfile.model || DEFAULT_IMAGE_WORKERS_MODEL
    rawResult = await runWorkersAiCompatImageRequest(
      {
        apiKey: selectedWorkersProfile.api_key,
        baseURL: selectedWorkersProfile.base_url,
        model,
      },
      {
        prompt,
        width,
        height,
      },
    )
  }

  const asset = await extractWorkersAiImageAsset(rawResult, model)
  const alt = (input.title || '文章封面').trim() || '文章封面'
  const { yyyy, mm } = getNowPrefix()
  const baseName = sanitizeFilename(alt).slice(0, 48)
  const key = `image/${yyyy}/${mm}/ai-cover-${nanoid(10)}-${baseName}.${asset.extension}`

  await input.images.put(key, asset.data, {
    httpMetadata: {
      contentType: asset.contentType,
      cacheControl: 'public, max-age=31536000, immutable',
    },
    customMetadata: {
      originalName: `${baseName}.${asset.extension}`,
      source: 'ai-post-cover',
    },
  })

  const encodedKey = key.split('/').map(encodeURIComponent).join('/')
  const variants = buildAssetUrls(encodedKey, readFlag(input.env?.ENABLE_CF_IMAGE_PIPELINE))

  return {
    key,
    url: `/api/images/${encodedKey}`,
    variants,
    prompt,
    revisedPrompt: prompt,
    alt,
    actionLabel: generator.label,
    aspectRatio: generator.aspect_ratio,
    resolution: generator.resolution,
    size: `${width}x${height}`,
    profileName: 'Workers AI',
    model,
  }
}

export async function generatePostCover(
  input: GeneratePostCoverInput,
): Promise<GeneratedPostCoverResult> {
  const generator = await getAiPostGeneratorByTarget(input.db, 'cover', input.env)
  if (!generator || generator.is_enabled !== 1) {
    throw new Error('当前封面生成功能未启用')
  }

  const image = generator.provider_mode === 'workers_ai'
    ? await generateWorkersAiCover(input, generator)
    : await (async () => {
        const secret = resolveAiConfigSecret(input.env as Record<string, unknown> | undefined)
        const profile = await resolveAiImageProfileConfig(
          input.db,
          secret,
          Number.isFinite(generator.image_profile_id) ? Number(generator.image_profile_id) : undefined,
        )

        if (!profile) {
          throw new Error('请先在后台配置可用的图片模型')
        }

        const { generateEditorImage } = await import('@/lib/ai-image')
        return generateEditorImage({
          action: 'custom',
          actionPrompt: generator.prompt,
          actionLabel: generator.label,
          userPrompt: buildCoverPrompt(generator, input),
          articleTitle: input.title,
          contextText: input.content,
          aspectRatio: generator.aspect_ratio,
          resolution: generator.resolution,
          profileId: profile.id,
          db: input.db,
          env: input.env as Record<string, string | undefined> | undefined,
          images: input.images,
        })
      })()

  return { generator, image }
}

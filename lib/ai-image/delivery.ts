import { nanoid } from 'nanoid'
import {
  buildAssetUrls,
  getNowPrefix,
  readFlag,
  sanitizeFilename,
  type GeneratedEditorImage,
  type ImageBucket,
} from './shared'
import { buildAltText } from './prompt'
import type { AIImageAspectRatio, AIImageResolution } from './options'

export async function persistGeneratedEditorImage(input: {
  images: ImageBucket
  env?: { ENABLE_CF_IMAGE_PIPELINE?: string }
  bytes: Uint8Array
  contentType: string
  extension: string
  revisedPrompt: string
  userPrompt?: string
  articleTitle?: string
  actionLabel?: string
  aspectRatio: AIImageAspectRatio
  resolution: AIImageResolution
  size: string
  profileName: string
  model: string
}): Promise<GeneratedEditorImage> {
  const alt = buildAltText(
    input.revisedPrompt,
    input.userPrompt,
    input.articleTitle,
    input.actionLabel || '自定义生成',
  )

  const { yyyy, mm } = getNowPrefix()
  const baseName = sanitizeFilename(alt).slice(0, 48)
  const key = `image/${yyyy}/${mm}/ai-${nanoid(10)}-${baseName}.${input.extension}`

  await input.images.put(key, input.bytes, {
    httpMetadata: {
      contentType: input.contentType,
      cacheControl: 'public, max-age=31536000, immutable',
    },
    customMetadata: {
      originalName: `${baseName}.${input.extension}`,
      source: 'ai-image',
    },
  })

  const encodedKey = key.split('/').map(encodeURIComponent).join('/')
  const variants = buildAssetUrls(encodedKey, readFlag(input.env?.ENABLE_CF_IMAGE_PIPELINE))

  return {
    key,
    url: `/api/images/${encodedKey}`,
    variants,
    prompt: input.revisedPrompt,
    revisedPrompt: input.revisedPrompt,
    alt,
    actionLabel: input.actionLabel || '自定义生成',
    aspectRatio: input.aspectRatio,
    resolution: input.resolution,
    size: input.size,
    profileName: input.profileName,
    model: input.model,
  }
}

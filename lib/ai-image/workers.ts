import {
  buildWorkersAiRunUrl,
} from '@/lib/ai-provider-profiles'
import {
  toBytesFromBase64,
} from './shared'
import {
  normalizeAiImageAspectRatio,
  type AIImageAspectRatio,
  type AIImageResolution,
} from './options'

function parseWorkersAiErrorMessage(
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

      const firstWorkersError = parsed.errors?.find((item) => typeof item?.message === 'string' && item.message.trim())
      if (firstWorkersError?.message) {
        return firstWorkersError.message.trim()
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

export function resolveWorkersAiImageSize(
  aspectRatio: AIImageAspectRatio,
  resolution: AIImageResolution,
) {
  const sizeTier = resolution === '4k' ? 1536 : resolution === '2k' ? 1344 : 1024
  const normalizedAspectRatio = normalizeAiImageAspectRatio(aspectRatio)
  const [ratioWidth, ratioHeight] = (normalizedAspectRatio === 'auto' ? '16:9' : normalizedAspectRatio)
    .split(':')
    .map((item) => Number(item))

  if (!Number.isFinite(ratioWidth) || !Number.isFinite(ratioHeight) || ratioWidth <= 0 || ratioHeight <= 0) {
    return { width: sizeTier, height: Math.round(sizeTier * 9 / 16) }
  }

  if (ratioWidth >= ratioHeight) {
    return {
      width: sizeTier,
      height: Math.max(512, Math.round(sizeTier * ratioHeight / ratioWidth)),
    }
  }

  return {
    width: Math.max(512, Math.round(sizeTier * ratioWidth / ratioHeight)),
    height: sizeTier,
  }
}

function inferImageTypeFromBytes(bytes: Uint8Array) {
  const isPng = bytes.length >= 4
    && bytes[0] === 0x89
    && bytes[1] === 0x50
    && bytes[2] === 0x4e
    && bytes[3] === 0x47

  if (isPng) {
    return { contentType: 'image/png', extension: 'png' }
  }

  const isJpeg = bytes.length >= 3
    && bytes[0] === 0xff
    && bytes[1] === 0xd8
    && bytes[2] === 0xff

  if (isJpeg) {
    return { contentType: 'image/jpeg', extension: 'jpg' }
  }

  const isWebp = bytes.length >= 12
    && bytes[0] === 0x52
    && bytes[1] === 0x49
    && bytes[2] === 0x46
    && bytes[3] === 0x46
    && bytes[8] === 0x57
    && bytes[9] === 0x45
    && bytes[10] === 0x42
    && bytes[11] === 0x50

  if (isWebp) {
    return { contentType: 'image/webp', extension: 'webp' }
  }

  return { contentType: 'image/png', extension: 'png' }
}

function getDefaultWorkersImageType(model: string) {
  if (/phoenix/i.test(model)) {
    return { contentType: 'image/jpeg', extension: 'jpg' }
  }
  return { contentType: 'image/png', extension: 'png' }
}

function isReadableStreamLike(value: unknown): value is ReadableStream {
  return Boolean(value && typeof value === 'object' && 'getReader' in value)
}

export async function extractWorkersAiImageAsset(result: unknown, model: string): Promise<{
  data: ReadableStream | Uint8Array
  contentType: string
  extension: string
}> {
  if (result instanceof Response) {
    if (!result.body) throw new Error('Workers AI 未返回图片内容')
    const contentType = result.headers.get('content-type') || getDefaultWorkersImageType(model).contentType
    const extension = contentType.includes('jpeg')
      ? 'jpg'
      : contentType.includes('webp')
        ? 'webp'
        : 'png'

    return {
      data: result.body,
      contentType,
      extension,
    }
  }

  if (isReadableStreamLike(result)) {
    const fallbackType = getDefaultWorkersImageType(model)
    return {
      data: result,
      contentType: fallbackType.contentType,
      extension: fallbackType.extension,
    }
  }

  if (result instanceof ArrayBuffer) {
    const bytes = new Uint8Array(result)
    const inferred = inferImageTypeFromBytes(bytes)
    return { data: bytes, ...inferred }
  }

  if (ArrayBuffer.isView(result)) {
    const bytes = new Uint8Array(result.buffer.slice(result.byteOffset, result.byteOffset + result.byteLength))
    const inferred = inferImageTypeFromBytes(bytes)
    return { data: bytes, ...inferred }
  }

  const payload = result && typeof result === 'object'
    ? result as {
        image?: string
        result?: {
          image?: string
          url?: string
        }
        url?: string
      }
    : null

  const base64Image = payload?.image || payload?.result?.image || ''
  if (base64Image) {
    const bytes = toBytesFromBase64(base64Image)
    const inferred = inferImageTypeFromBytes(bytes)
    return { data: bytes, ...inferred }
  }

  const remoteUrl = payload?.url || payload?.result?.url || ''
  if (remoteUrl) {
    const response = await fetch(remoteUrl, { signal: AbortSignal.timeout(30000) })
    if (!response.ok) {
      throw new Error(`拉取 Workers AI 图片失败：HTTP ${response.status}`)
    }
    const bytes = new Uint8Array(await response.arrayBuffer())
    const contentType = response.headers.get('content-type') || getDefaultWorkersImageType(model).contentType
    const extension = contentType.includes('jpeg')
      ? 'jpg'
      : contentType.includes('webp')
        ? 'webp'
        : 'png'

    return {
      data: bytes,
      contentType,
      extension,
    }
  }

  throw new Error('Workers AI 图片模型未返回可用内容')
}

function shouldRetryWorkersAiMultipart(error: Error | null, model: string) {
  const normalizedModel = model.trim().toLowerCase()
  if (normalizedModel.includes('flux-2-dev')) return true
  if (!error) return false

  const message = error.message.toLowerCase()
  return message.includes('multipart')
    || message.includes('form-data')
    || message.includes("required properties at '/' are 'multipart'")
}

async function parseWorkersAiRunResponse(response: Response) {
  const contentType = (response.headers.get('content-type') || '').toLowerCase()

  if (contentType.startsWith('image/')) {
    return response
  }

  const rawBody = await response.text().catch(() => '')
  if (!response.ok) {
    throw new Error(parseWorkersAiErrorMessage(response.status, response.statusText, rawBody))
  }

  try {
    return rawBody ? JSON.parse(rawBody) : null
  } catch {
    throw new Error('Workers AI 图片接口返回了无法解析的内容')
  }
}

export async function runWorkersAiCompatImageRequest(
  config: {
    apiKey: string
    baseURL: string
    model: string
  },
  input: {
    prompt: string
    width: number
    height: number
  },
) {
  const endpoint = buildWorkersAiRunUrl(config.baseURL, config.model)
  let lastError: Error | null = null

  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        prompt: input.prompt,
        width: input.width,
        height: input.height,
      }),
      signal: AbortSignal.timeout(120000),
    })

    return await parseWorkersAiRunResponse(response)
  } catch (error) {
    lastError = error instanceof Error ? error : new Error(String(error))
  }

  if (!shouldRetryWorkersAiMultipart(lastError, config.model)) {
    throw lastError || new Error('Workers AI 图片接口请求失败')
  }

  const formData = new FormData()
  formData.append('prompt', input.prompt)
  formData.append('width', String(input.width))
  formData.append('height', String(input.height))

  const multipartResponse = await fetch(endpoint, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${config.apiKey}`,
    },
    body: formData,
    signal: AbortSignal.timeout(120000),
  })

  return parseWorkersAiRunResponse(multipartResponse)
}

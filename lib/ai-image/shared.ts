import type { AIImageAspectRatio, AIImageResolution } from '@/lib/ai-image/options'

export type ImageBucket = {
  put: (
    key: string,
    value: File | ArrayBuffer | ArrayBufferView | ReadableStream,
    options?: {
      httpMetadata?: {
        contentType?: string
        cacheControl?: string
      }
      customMetadata?: Record<string, string>
    }
  ) => Promise<void>
}

export interface AIImageEnv {
  AI_CONFIG_ENCRYPTION_SECRET?: string
  ADMIN_TOKEN_SALT?: string
  ENABLE_CF_IMAGE_PIPELINE?: string
}

export interface GeneratedEditorImage {
  key: string
  url: string
  variants: {
    raw: string
    content: string
    thumb: string
    cover: string
  }
  prompt: string
  revisedPrompt: string
  alt: string
  actionLabel: string
  aspectRatio: AIImageAspectRatio
  resolution: AIImageResolution
  size: string
  profileName: string
  model: string
}

export function readFlag(value: unknown): boolean {
  return typeof value === 'string' && ['1', 'true', 'yes', 'on'].includes(value.trim().toLowerCase())
}

export function sanitizeFilename(filename: string) {
  const trimmed = filename.trim().toLowerCase()
  const safe = trimmed.replace(/[^a-z0-9._-]+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '')
  return safe || 'image'
}

export function inferExtensionFromContentType(contentType: string | null) {
  const normalized = (contentType || '').toLowerCase()
  if (normalized.includes('png')) return 'png'
  if (normalized.includes('jpeg') || normalized.includes('jpg')) return 'jpg'
  if (normalized.includes('webp')) return 'webp'
  return 'png'
}

export function buildAssetUrls(encodedKey: string, cloudflareEnabled: boolean) {
  const baseUrl = `/api/images/${encodedKey}`
  return {
    raw: baseUrl,
    content: cloudflareEnabled ? `${baseUrl}?w=1600&q=85&format=webp` : baseUrl,
    thumb: cloudflareEnabled ? `${baseUrl}?w=960&q=82&format=webp` : baseUrl,
    cover: cloudflareEnabled ? `${baseUrl}?w=1600&h=900&fit=cover&q=84&format=webp` : baseUrl,
  }
}

export function getNowPrefix() {
  const now = new Date()
  const yyyy = now.getUTCFullYear()
  const mm = String(now.getUTCMonth() + 1).padStart(2, '0')
  return { yyyy, mm }
}

export function toBytesFromBase64(input: string): Uint8Array {
  const normalized = input.trim()
  if (!normalized) return new Uint8Array()

  const BufferCtor = (globalThis as unknown as {
    Buffer?: {
      from: (input: string, encoding: string) => Uint8Array
    }
  }).Buffer

  if (BufferCtor) {
    return new Uint8Array(BufferCtor.from(normalized, 'base64'))
  }

  const binary = atob(normalized)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i)
  }
  return bytes
}

export async function toUint8Array(input: ReadableStream | Uint8Array) {
  if (input instanceof Uint8Array) return input
  return new Uint8Array(await new Response(input).arrayBuffer())
}

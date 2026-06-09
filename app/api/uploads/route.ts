import { NextRequest, NextResponse } from 'next/server'
import { getAppCloudflareEnv } from '@/lib/cloudflare'
import { authenticateRequest } from '@/lib/admin-auth'
import { nanoid } from 'nanoid'
import {
  createRequestId,
  logServerEvent,
  serverErrorResponse,
  withRequestId,
} from '@/lib/server/observability'

type ImageBucket = {
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
  get: (key: string) => Promise<{ customMetadata?: Record<string, string> } | null>
}

type RuntimeEnv = {
  IMAGES?: ImageBucket
  ENABLE_CF_IMAGE_PIPELINE?: string
}

const MAX_FILE_SIZE = 100 * 1024 * 1024 // 100MB (Cloudflare Workers limit)

const ALLOWED_TYPES: Record<string, string[]> = {
  image: ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/svg+xml', 'image/avif'],
  audio: ['audio/mpeg', 'audio/wav', 'audio/ogg', 'audio/aac', 'audio/flac', 'audio/mp4'],
  video: ['video/mp4', 'video/webm', 'video/ogg', 'video/quicktime'],
  document: [
    'application/pdf',
    'application/zip', 'application/x-zip-compressed',
    'application/x-rar-compressed', 'application/x-rar',
    'application/x-7z-compressed',
    'application/epub+zip',
    'application/x-mobipocket-ebook',
    'application/vnd.amazon.ebook',
    'text/plain',
    'application/octet-stream',
  ],
}

const ALL_ALLOWED = Object.values(ALLOWED_TYPES).flat()

function readFlag(value: unknown): boolean {
  return typeof value === 'string' && ['1', 'true', 'yes', 'on'].includes(value.trim().toLowerCase())
}

function getFileCategory(mimeType: string): string {
  for (const [cat, types] of Object.entries(ALLOWED_TYPES)) {
    if (types.includes(mimeType)) return cat
  }
  return 'document'
}

function sanitizeFilename(filename: string) {
  const trimmed = filename.trim().toLowerCase()
  const safe = trimmed.replace(/[^a-z0-9._-]+/g, '-').replace(/-+/g, '-')
  return safe || 'file'
}

function buildAssetUrls(encodedKey: string, cloudflareEnabled: boolean) {
  const baseUrl = `/api/images/${encodedKey}`
  return {
    raw: baseUrl,
    content: cloudflareEnabled ? `${baseUrl}?w=1600&q=85&format=webp` : baseUrl,
    thumb: cloudflareEnabled ? `${baseUrl}?w=960&q=82&format=webp` : baseUrl,
    cover: cloudflareEnabled ? `${baseUrl}?w=1600&h=900&fit=cover&q=84&format=webp` : baseUrl,
  }
}

async function calculateHash(file: File): Promise<string> {
  const buffer = await file.arrayBuffer()
  const hashBuffer = await crypto.subtle.digest('SHA-256', buffer)
  const hashArray = Array.from(new Uint8Array(hashBuffer))
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('').slice(0, 16)
}

export async function POST(req: NextRequest) {
  const requestId = createRequestId(req)
  const routeName = '/api/uploads'
  try {
    // 认证：Cookie OR Bearer Token
    const env = (await getAppCloudflareEnv()) as RuntimeEnv & { DB?: D1Database }
    const isAuthenticated = await authenticateRequest(req, env?.DB)

    if (!isAuthenticated) {
      return serverErrorResponse({
        requestId,
        route: routeName,
        method: 'POST',
        code: 'UPLOAD_UNAUTHORIZED',
        message: 'Unauthorized',
        status: 401,
      })
    }

    if (!env?.IMAGES) {
      return serverErrorResponse({
        requestId,
        route: routeName,
        method: 'POST',
        code: 'UPLOAD_STORAGE_UNAVAILABLE',
        message: '图片存储未配置，请用 Cloudflare preview/runtime 启动。',
        hint: '请检查 Cloudflare R2 的 IMAGES 绑定。',
      })
    }

    const formData = await req.formData()
    const file = formData.get('file')

    if (!(file instanceof File)) {
      return serverErrorResponse({
        requestId,
        route: routeName,
        method: 'POST',
        code: 'UPLOAD_FILE_REQUIRED',
        message: '缺少文件',
        status: 400,
      })
    }

    logServerEvent('info', 'UPLOAD_STARTED', {
      requestId,
      route: routeName,
      method: 'POST',
      context: { name: file.name, size: file.size, type: file.type },
    })

    // Check allowed file types (allow unknown types with common extensions)
    const ext = file.name.split('.').pop()?.toLowerCase() || ''
    const knownExts = ['zip', 'rar', '7z', 'epub', 'mobi', 'azw', 'azw3', 'pdf', 'txt', 'mp3', 'mp4', 'wav', 'ogg', 'webm', 'mov', 'flac', 'aac']
    if (!ALL_ALLOWED.includes(file.type) && !file.type.startsWith('image/') && !knownExts.includes(ext)) {
      return serverErrorResponse({
        requestId,
        route: routeName,
        method: 'POST',
        code: 'UPLOAD_TYPE_UNSUPPORTED',
        message: `不支持的文件类型: ${file.type}`,
        status: 400,
        context: { name: file.name, type: file.type },
      })
    }

    if (file.size > MAX_FILE_SIZE) {
      return serverErrorResponse({
        requestId,
        route: routeName,
        method: 'POST',
        code: 'UPLOAD_FILE_TOO_LARGE',
        message: '文件不能超过 100MB',
        status: 400,
        context: { name: file.name, size: file.size },
      })
    }

    const category = getFileCategory(file.type)
    const now = new Date()
    const yyyy = now.getUTCFullYear()
    const mm = String(now.getUTCMonth() + 1).padStart(2, '0')

    // 小文件（<5MB）做 hash 去重；大文件跳过（hash 在 Workers 上太慢）
    const HASH_THRESHOLD = 5 * 1024 * 1024
    let key: string
    const cloudflareImagePipeline = category === 'image' && readFlag(env.ENABLE_CF_IMAGE_PIPELINE)

    if (file.size <= HASH_THRESHOLD) {
      const fileHash = await calculateHash(file)
      const dedupKey = `${category}/${yyyy}/${mm}/${fileHash}-${sanitizeFilename(file.name)}`

      const existing = await env.IMAGES.get(dedupKey)
      if (existing) {
        const encodedKey = dedupKey.split('/').map(encodeURIComponent).join('/')
        const variants = category === 'image' ? buildAssetUrls(encodedKey, cloudflareImagePipeline) : undefined
        logServerEvent('info', 'UPLOAD_DEDUPLICATED', {
          requestId,
          route: routeName,
          method: 'POST',
          context: { key: dedupKey, size: file.size, type: category },
        })
        return withRequestId(NextResponse.json({
          success: true,
          key: dedupKey,
          url: `/api/images/${encodedKey}`,
          type: category,
          name: file.name,
          size: file.size,
          deduplicated: true,
          delivery: cloudflareImagePipeline ? 'cloudflare' : 'origin',
          variants,
        }), requestId)
      }
      key = dedupKey
    } else {
      // 大文件：nanoid key，不做 hash 去重
      key = `${category}/${yyyy}/${mm}/${nanoid(10)}-${sanitizeFilename(file.name)}`
    }

    // 确保文件使用正确的 MIME 类型
    let contentType = file.type
    if (!contentType || contentType === 'application/octet-stream') {
      const ext = file.name.split('.').pop()?.toLowerCase()
      if (ext === 'mov') contentType = 'video/quicktime'
      else if (ext === 'mp4') contentType = 'video/mp4'
      else if (ext === 'webm') contentType = 'video/webm'
      else if (ext === 'mp3') contentType = 'audio/mpeg'
      else if (ext === 'wav') contentType = 'audio/wav'
      else if (ext === 'pdf') contentType = 'application/pdf'
      else if (ext === 'zip') contentType = 'application/zip'
      else if (ext === 'rar') contentType = 'application/x-rar-compressed'
      else if (ext === '7z') contentType = 'application/x-7z-compressed'
      else if (ext === 'epub') contentType = 'application/epub+zip'
      else if (ext === 'mobi') contentType = 'application/x-mobipocket-ebook'
      else if (ext === 'azw' || ext === 'azw3') contentType = 'application/vnd.amazon.ebook'
      else if (ext === 'txt') contentType = 'text/plain'
    }

    await env.IMAGES.put(key, file, {
      httpMetadata: {
        contentType,
        cacheControl: 'public, max-age=31536000, immutable',
      },
      customMetadata: {
        originalName: file.name,
      },
    })

    const encodedKey = key.split('/').map(encodeURIComponent).join('/')
    const variants = category === 'image' ? buildAssetUrls(encodedKey, cloudflareImagePipeline) : undefined

    logServerEvent('info', 'UPLOAD_SUCCEEDED', {
      requestId,
      route: routeName,
      method: 'POST',
      context: { key, size: file.size, type: category },
    })
    return withRequestId(NextResponse.json({
      success: true,
      key,
      url: `/api/images/${encodedKey}`,
      type: category,
      name: file.name,
      size: file.size,
      delivery: cloudflareImagePipeline ? 'cloudflare' : 'origin',
      variants,
    }), requestId)
  } catch (error) {
    return serverErrorResponse({
      requestId,
      route: routeName,
      method: 'POST',
      code: 'UPLOAD_FAILED',
      message: '文件上传失败',
      hint: '请使用 requestId 在 Cloudflare Worker 日志中搜索具体错误。',
      details: error instanceof Error ? error.message : String(error),
      error,
    })
  }
}

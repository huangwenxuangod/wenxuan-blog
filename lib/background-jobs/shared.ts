export type BackgroundJob =
  | {
      type: 'process-post-ai'
      postId: number
    }
  | {
      type: 'sync-post-related-index'
      postId: number
    }
  | {
      type: 'delete-post-related-index'
      postId: number
    }

export interface BackgroundJobEnv extends Partial<CloudflareEnv> {
  DB?: D1Database
  CACHE?: KVNamespace
  BACKGROUND_QUEUE?: QueueBinding
  VECTOR_INDEX?: VectorizeIndex
}

export interface BackgroundJobMessage<T> {
  body: T
  ack?: () => void
  retry?: () => void
}

export interface BackgroundJobBatch<T> {
  messages: Array<BackgroundJobMessage<T>>
}

export interface EnqueueBackgroundJobOptions {
  waitUntil?: (promise: Promise<unknown>) => void
}

export function readBackgroundJobFlag(value: unknown): boolean {
  return typeof value === 'string' && ['1', 'true', 'yes', 'on'].includes(value.trim().toLowerCase())
}

export function shouldUseBackgroundQueue(env?: BackgroundJobEnv | null): boolean {
  return Boolean(env?.BACKGROUND_QUEUE) && readBackgroundJobFlag(env?.ENABLE_BACKGROUND_JOBS)
}

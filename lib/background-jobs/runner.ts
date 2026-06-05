import { invalidatePublicContentCache } from '@/lib/cache'
import { getPostAiSnapshot, updatePost } from '@/lib/db'
import { buildAutoDescription } from '@/lib/post-utils'
import type {
  BackgroundJob,
  BackgroundJobBatch,
  BackgroundJobEnv,
} from './shared'

async function runProcessPostAiJob(env: BackgroundJobEnv, postId: number) {
  if (!env.DB) return

  const [{ processPost, getAiRuntimeEnv }, { syncPostToRelatedIndex }] = await Promise.all([
    import('@/lib/ai'),
    import('@/lib/related-content/index-sync'),
  ])

  const post = await getPostAiSnapshot(env.DB, postId)
  if (!post || post.deleted_at) return

  const aiResult = await processPost(post.title, post.content, getAiRuntimeEnv(env), 2, env.DB)
  if (!aiResult) return

  const updates: Parameters<typeof updatePost>[2] = {}
  const autoDescription = buildAutoDescription(post.content)

  if (!post.category || post.category === '未分类') {
    updates.category = aiResult.category
  }

  if (post.tags.length === 0 && aiResult.tags.length > 0) {
    updates.tags = aiResult.tags
  }

  if (!post.description || post.description === autoDescription) {
    updates.description = aiResult.description
  }

  if (Object.keys(updates).length === 0) return

  await updatePost(env.DB, postId, updates)
  await invalidatePublicContentCache(env)

  await syncPostToRelatedIndex(env, postId)
}

async function runSyncPostRelatedIndexJob(env: BackgroundJobEnv, postId: number) {
  const { syncPostToRelatedIndex } = await import('@/lib/related-content/index-sync')
  await syncPostToRelatedIndex(env, postId)
}

async function runDeletePostRelatedIndexJob(env: BackgroundJobEnv, postId: number) {
  const { deletePostFromRelatedIndex } = await import('@/lib/related-content/index-sync')
  await deletePostFromRelatedIndex(env, postId)
}

export async function runBackgroundJob(env: BackgroundJobEnv, job: BackgroundJob): Promise<void> {
  switch (job.type) {
    case 'process-post-ai':
      await runProcessPostAiJob(env, job.postId)
      return
    case 'sync-post-related-index':
      await runSyncPostRelatedIndexJob(env, job.postId)
      return
    case 'delete-post-related-index':
      await runDeletePostRelatedIndexJob(env, job.postId)
      return
  }
}

export async function consumeBackgroundJobBatch(
  batch: BackgroundJobBatch<BackgroundJob>,
  env: BackgroundJobEnv,
): Promise<void> {
  for (const message of batch.messages) {
    try {
      await runBackgroundJob(env, message.body)
      message.ack?.()
    } catch (error) {
      console.error('Queue background job failed:', error)
      message.retry?.()
    }
  }
}

import {
  type BackgroundJob,
  type BackgroundJobEnv,
  type EnqueueBackgroundJobOptions,
  shouldUseBackgroundQueue,
} from './shared'

async function runInlineRelatedContentJob(env: BackgroundJobEnv, job: BackgroundJob): Promise<void> {
  if (job.type === 'process-post-ai') {
    const { runBackgroundJob } = await import('./runner')
    await runBackgroundJob(env, job)
    return
  }

  const { syncPostToRelatedIndex, deletePostFromRelatedIndex } = await import('@/lib/related-content/index-sync')

  if (job.type === 'sync-post-related-index') {
    await syncPostToRelatedIndex(env, job.postId)
    return
  }

  await deletePostFromRelatedIndex(env, job.postId)
}

export async function enqueueBackgroundJob(
  env: BackgroundJobEnv,
  job: BackgroundJob,
  options?: EnqueueBackgroundJobOptions,
): Promise<'queue' | 'waitUntil' | 'inline'> {
  if (shouldUseBackgroundQueue(env)) {
    try {
      await env.BACKGROUND_QUEUE!.send(job)
      return 'queue'
    } catch (error) {
      console.error('Failed to enqueue background job, falling back to inline execution:', error)
    }
  }

  const task = runInlineRelatedContentJob(env, job)

  if (options?.waitUntil) {
    options.waitUntil(
      task.catch((error) => {
        console.error('Background job failed:', error)
      }),
    )
    return 'waitUntil'
  }

  void task.catch((error) => {
    console.error('Background job failed:', error)
  })
  return 'inline'
}

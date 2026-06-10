// open-next generates this module during the Cloudflare build step.
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore -- generated artifact may be absent during clean Next type-checks
import { default as handler } from './.open-next/worker.js'
import { syncAihotDaily } from './lib/aihot-daily'
import { consumeBackgroundJobBatch } from './lib/background-jobs/runner'
import type { BackgroundJob, BackgroundJobEnv } from './lib/background-jobs/shared'

interface QueueMessage<T> {
  body: T
  ack?: () => void
  retry?: () => void
}

interface QueueBatch<T> {
  messages: Array<QueueMessage<T>>
}

const customWorker = {
  fetch: handler.fetch,

  async queue(batch: QueueBatch<BackgroundJob>, env: BackgroundJobEnv) {
    await consumeBackgroundJobBatch(batch, env)
  },

  async scheduled(_controller: ScheduledController, env: CloudflareEnv, ctx: ExecutionContext) {
    if (!env.DB) return

    ctx.waitUntil((async () => {
      try {
        await syncAihotDaily(env.DB)
      } catch (error) {
        console.error('[AIHOT_DAILY_CRON_FAILED]', error)
      }
    })())
  },
}

export default customWorker

// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore -- generated artifact may be absent during clean Next type-checks
export { DOQueueHandler, DOShardedTagCache } from './.open-next/worker.js'

import { getCloudflareContext } from '@opennextjs/cloudflare'
import type { CloudflareContext } from '@opennextjs/cloudflare'

export async function getAppCloudflareContext(): Promise<CloudflareContext> {
  if (process.env.NODE_ENV === 'development' && process.env.ENABLE_OPENNEXT_DEV !== '1') {
    return {
      env: process.env as unknown as CloudflareEnv,
      cf: undefined,
      ctx: {
        waitUntil() {},
        passThroughOnException() {},
      } as CloudflareContext['ctx'],
    }
  }

  return getCloudflareContext({ async: true })
}

export async function getAppCloudflareEnv() {
  return (await getAppCloudflareContext()).env
}

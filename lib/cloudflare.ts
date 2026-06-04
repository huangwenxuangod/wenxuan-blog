import { getCloudflareContext } from '@opennextjs/cloudflare'
import type { CloudflareContext } from '@opennextjs/cloudflare'

let localDevContextPromise: Promise<CloudflareContext> | undefined

async function getLocalDevCloudflareContext(): Promise<CloudflareContext> {
  localDevContextPromise ??= loadWrangler().then(async ({ getPlatformProxy }) => {
    const proxy = await getPlatformProxy({
      configPath: 'wrangler.toml',
      remoteBindings: false,
      envFiles: ['.env.local'],
    })

    return {
      env: proxy.env as unknown as CloudflareEnv,
      cf: proxy.cf,
      ctx: proxy.ctx as CloudflareContext['ctx'],
    }
  })

  return localDevContextPromise
}

function loadWrangler(): Promise<{
  getPlatformProxy: (options: Record<string, unknown>) => Promise<{
    env: unknown
    cf: CloudflareContext['cf']
    ctx: unknown
  }>
}> {
  const load = new Function('specifier', 'return import(specifier)') as (
    specifier: string,
  ) => Promise<{
    getPlatformProxy: (options: Record<string, unknown>) => Promise<{
      env: unknown
      cf: CloudflareContext['cf']
      ctx: unknown
    }>
  }>

  return load('wrangler')
}

export async function getAppCloudflareContext(): Promise<CloudflareContext> {
  if (process.env.NODE_ENV === 'development' && process.env.ENABLE_OPENNEXT_DEV !== '1') {
    return getLocalDevCloudflareContext()
  }

  return getCloudflareContext({ async: true })
}

export async function getAppCloudflareEnv() {
  return (await getAppCloudflareContext()).env
}

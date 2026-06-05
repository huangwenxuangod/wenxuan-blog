import type { NextRequest } from 'next/server'
import { ensureAuthenticatedRequest, getRouteEnvWithDb, jsonError, jsonOk } from '@/lib/server/route-helpers'
import {
  assertWechatBridgeReady,
  fetchWechatBridgeJson,
  getWechatBridgeConfig,
  type WechatBridgeAccount,
} from '@/lib/wechat/bridge-config'

export async function GET(req: NextRequest) {
  const route = await getRouteEnvWithDb('DB unavailable')
  if (!route.ok) return route.response

  const unauthorized = await ensureAuthenticatedRequest(req, route.db)
  if (unauthorized) return unauthorized

  try {
    const config = await getWechatBridgeConfig(route.db, route.env)
    if (!config.configured || !config.enabled) {
      return jsonOk({
        accounts: [],
        ready: false,
      })
    }
    const response = await fetchWechatBridgeJson<{ accounts?: WechatBridgeAccount[] }>(config, '/v1/accounts')

    return jsonOk({
      accounts: response.accounts || [],
      ready: true,
    })
  } catch (error) {
    return jsonOk({
      accounts: [],
      ready: false,
      error: error instanceof Error ? error.message : String(error)
    })
  }
}

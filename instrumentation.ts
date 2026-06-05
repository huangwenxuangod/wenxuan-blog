export async function register() {
  // 可以在这里初始化 Sentry / Logtail 等监控服务
}

export async function onRequestError(
  error: unknown,
  request: {
    path: string
    revalidateReason?: number | 'on-demand' | 'stale'
  },
  context: {
    routerKind: 'pages' | 'app'
    routePath: string
    routeType: 'render' | 'route' | 'action'
  }
) {
  // 统一捕获服务端请求级未处理异常（包括 Server Component 渲染、Route Handler、Server Actions）
  console.error('[Server Request Error Captured]', {
    path: request.path,
    routePath: context.routePath,
    routeType: context.routeType,
    error: error instanceof Error ? {
      message: error.message,
      stack: error.stack,
    } : String(error),
  })
}

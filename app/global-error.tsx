'use client'

import { useEffect } from 'react'

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error('Global App Router Error:', error)
  }, [error])

  return (
    <html lang="zh-CN">
      <body className="bg-[#f5f4ed] text-[#141413] min-h-screen flex flex-col items-center justify-center px-4 text-center font-sans">
        <div className="max-w-md space-y-6">
          <div className="space-y-2">
            <span className="inline-block px-3 py-1 text-xs font-medium bg-[#e8e6dc] rounded-full text-[#5e5d59]">
              全局崩溃
            </span>
            <h1 className="text-3xl font-serif font-semibold tracking-tight text-[#141413]">
              系统遇到了严重错误
            </h1>
            <p className="text-sm text-[#5e5d59] leading-relaxed">
              底层容器或主布局发生了致命异常，未能正常加载。
            </p>
          </div>

          {error.digest && (
            <div className="p-3 bg-[#faf9f5] border border-[#f0eee6] rounded text-xs font-mono text-[#5e5d59] break-all">
              错误识别码 (Digest): {error.digest}
            </div>
          )}

          <div className="flex items-center justify-center gap-4">
            <button
              onClick={() => window.location.reload()}
              className="px-4 py-2 text-sm font-medium border border-[#e8e6dc] hover:bg-[#faf9f5] rounded cursor-pointer transition-colors"
            >
              刷新整个站点
            </button>
            <button
              onClick={() => reset()}
              className="px-4 py-2 text-sm font-medium text-white bg-[#c96442] hover:bg-[#b05334] rounded cursor-pointer transition-colors"
            >
              重试加载
            </button>
          </div>
        </div>
      </body>
    </html>
  )
}

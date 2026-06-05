'use client'

import { useEffect } from 'react'
import { UiButton } from '@/components/ui/primitives'

export default function AdminError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error('Admin Dashboard Error:', error)
  }, [error])

  return (
    <div className="flex min-h-[70vh] flex-col items-center justify-center p-6 text-center bg-[#faf9f5] text-[#141413] border border-[#f0eee6] rounded-xl m-4">
      <div className="max-w-lg space-y-6">
        <div className="space-y-2">
          <span className="inline-block px-3 py-1 text-xs font-semibold bg-[#e8e6dc] rounded-full text-[#c96442] uppercase tracking-wider">
            管理后台异常
          </span>
          <h1 className="text-2xl font-semibold tracking-tight text-[#141413]">
            控制面板组件加载失败
          </h1>
          <p className="text-sm text-[#5e5d59] leading-relaxed">
            可能由于网络波动、Session 过期或底层绑定的 Cloudflare D1 数据库、KV 缓存未连接导致。
          </p>
        </div>

        <div className="p-4 bg-[#f5f4ed] border border-[#e8e6dc] rounded-lg text-left space-y-2">
          <div className="text-xs font-mono font-bold text-[#141413]">
            调试排查信息：
          </div>
          <div className="text-xs font-mono text-[#5e5d59] whitespace-pre-wrap break-all max-h-40 overflow-y-auto">
            {error.message || '未知错误'}
          </div>
          {error.digest && (
            <div className="text-xs font-mono text-[#5e5d59] border-t border-[#e8e6dc] pt-2 mt-2">
              Digest: {error.digest}
            </div>
          )}
        </div>

        <div className="flex items-center justify-center gap-4">
          <UiButton
            onClick={() => window.location.href = '/admin'}
            tone="soft"
            className="cursor-pointer"
          >
            返回后台首页
          </UiButton>
          <UiButton
            onClick={() => reset()}
            tone="solid"
            className="cursor-pointer bg-[#c96442] hover:bg-[#b05334] text-white"
          >
            重新尝试加载
          </UiButton>
        </div>
      </div>
    </div>
  )
}

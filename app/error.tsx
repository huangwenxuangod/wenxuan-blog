'use client'

import { useEffect } from 'react'
import { UiButton } from '@/components/ui/primitives'

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    // Log the error to an error reporting service
    console.error('App Router Rendering Error:', error)
  }, [error])

  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center px-4 text-center bg-[#f5f4ed] text-[#141413]">
      <div className="max-w-md space-y-6">
        <div className="space-y-2">
          <span className="inline-block px-3 py-1 text-xs font-medium bg-[#e8e6dc] rounded-full text-[#5e5d59]">
            页面出错
          </span>
          <h1 className="text-3xl font-serif font-semibold tracking-tight text-[#141413]">
            抱歉，系统遇到了一个问题
          </h1>
          <p className="text-sm text-[#5e5d59] leading-relaxed">
            在渲染此页面时发生了未预料到的错误。如果问题持续存在，请联系管理员。
          </p>
        </div>

        {error.digest && (
          <div className="p-3 bg-[#faf9f5] border border-[#f0eee6] rounded text-xs font-mono text-[#5e5d59] break-all">
            错误识别码 (Digest): {error.digest}
          </div>
        )}

        <div className="flex items-center justify-center gap-4">
          <UiButton
            onClick={() => window.location.reload()}
            tone="soft"
            className="cursor-pointer"
          >
            刷新页面
          </UiButton>
          <UiButton
            onClick={() => reset()}
            tone="solid"
            className="cursor-pointer bg-[#c96442] hover:bg-[#b05334] text-white"
          >
            重试
          </UiButton>
        </div>
      </div>
    </div>
  )
}
